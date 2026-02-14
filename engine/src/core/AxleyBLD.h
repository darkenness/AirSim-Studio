#pragma once

#include <string>
#include <cmath>

namespace contam {

// Axley Boundary Layer Diffusion (BLD) and Reversible Adsorption Model
//
// Based on Axley (1991) linear adsorption isotherm boundary layer diffusion model.
// Captures VOC adsorption on porous building materials and long-term desorption.
//
// Surface transfer rate formula:
//   S_α(t) = ctrl · h · ρ_film · A_s · [C_α(t) - C_s(t)/k]
//
// Parameters:
//   h     : boundary layer convective mass transfer coefficient (m/s)
//   ρ_film: film density = average of bulk and near-surface air density (kg/m³)
//   A_s   : adsorbent geometric exposed surface area (m²)
//   C_s(t): solid-phase equivalent concentration (kg/m³), state variable
//   k     : Henry's adsorption constant / partition coefficient (dimensionless)
//
// Dynamic state reversal: when C_s(t)/k > C_α(t), the transfer rate becomes
// negative, automatically switching from SINK to SOURCE (secondary emission).
//
// Update equation for solid-phase (implicit Euler):
//   C_s^{n+1} = C_s^n + dt · h · ρ_film · A_s · [C_α^{n+1} - C_s^{n+1}/k] / V_s
//   where V_s is an effective solid volume (typically A_s · thickness)

struct AxleyBLDSource {
    int zoneIdx;          // which zone this surface is in
    int speciesIdx;       // which species
    double h;             // mass transfer coefficient (m/s), typical: 0.001-0.01
    double surfaceArea;   // exposed surface area A_s (m²)
    double partitionCoeff; // Henry's constant k (dimensionless), typical: 1000-100000
    double solidThickness; // effective solid layer thickness (m), typical: 0.001-0.01
    double scheduleMult;  // schedule multiplier (1.0 = active)

    // State variables (updated each timestep)
    double solidConc;     // C_s(t) - solid-phase concentration (kg/m³)

    AxleyBLDSource()
        : zoneIdx(0), speciesIdx(0), h(0.005), surfaceArea(10.0),
          partitionCoeff(10000.0), solidThickness(0.005), scheduleMult(1.0),
          solidConc(0.0) {}

    AxleyBLDSource(int zone, int spec, double h, double As, double k, double thickness = 0.005)
        : zoneIdx(zone), speciesIdx(spec), h(h), surfaceArea(As),
          partitionCoeff(k), solidThickness(thickness), scheduleMult(1.0),
          solidConc(0.0) {}

    // Compute transfer rate S_α (kg/s) given current air concentration
    // Positive = adsorption (sink), Negative = desorption (source)
    double computeTransferRate(double airConc, double filmDensity) const {
        return scheduleMult * h * filmDensity * surfaceArea * (airConc - solidConc / partitionCoeff);
    }

    // Update solid-phase concentration using implicit Euler
    // Returns the effective source/sink contribution to the air-phase equation
    // For implicit solver integration:
    //   - Add to A diagonal: h * ρ_film * A_s (removal from air, implicit in C^{n+1})
    //   - Add to b (RHS): h * ρ_film * A_s * C_s^n / (k + h*ρ_film*A_s*dt/V_s)
    void updateSolidPhase(double airConcNew, double filmDensity, double dt) {
        double Vs = surfaceArea * solidThickness;
        if (Vs <= 0.0) Vs = 1e-6;

        // Implicit update: C_s^{n+1} = (C_s^n + dt*h*ρ*A_s*airConc/Vs) / (1 + dt*h*ρ*A_s/(k*Vs))
        double coeff = h * filmDensity * surfaceArea;
        double denom = 1.0 + dt * coeff / (partitionCoeff * Vs);
        solidConc = (solidConc + dt * coeff * airConcNew / Vs) / denom;
    }

    // Get the implicit contribution coefficients for the contaminant [A] matrix
    // Returns pair: (a_diag_add, b_rhs_add)
    // a_diag_add goes to A(eq, eq) (positive = removal)
    // b_rhs_add goes to b(eq) (positive = generation)
    std::pair<double, double> getImplicitCoeffs(double filmDensity, double dt) const {
        double coeff = scheduleMult * h * filmDensity * surfaceArea;
        double Vs = surfaceArea * solidThickness;
        if (Vs <= 0.0) return {coeff, 0.0};

        // The desorption term (solid releasing back to air)
        double desorp = coeff * solidConc / partitionCoeff;

        return {coeff, desorp};
    }
};

} // namespace contam
