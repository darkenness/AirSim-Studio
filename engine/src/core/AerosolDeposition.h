#pragma once

#include <cmath>

namespace contam {

// Aerosol Deposition and Resuspension Dynamics Model
//
// Per CONTAM requirements document (Module 5.4):
//
// Deposition removal rate:
//   R(t) = d · (mult · A_s) · C_α
//   where d = size-specific deposition velocity (m/s)
//
// Resuspension emission factor:
//   E = K / V · A_s
//   where K = empirical resuspension kinetic energy feedback coefficient
//
// The deposited mass M_dep tracks total deposited material on surfaces.
// Resuspension rate depends on deposited mass and disturbance activity.

struct AerosolSurface {
    int zoneIdx;              // which zone
    int speciesIdx;           // which particulate species
    double depositionVelocity; // d (m/s), size-specific (e.g., 5e-4 for PM2.5)
    double surfaceArea;       // A_s (m²), deposition surface area
    double resuspensionK;     // K coefficient for resuspension (m³/s), 0 = no resuspension
    double multiplier;        // schedule multiplier (default 1.0)

    // State: deposited mass on surface (kg)
    double depositedMass;

    AerosolSurface()
        : zoneIdx(0), speciesIdx(0), depositionVelocity(5e-4),
          surfaceArea(10.0), resuspensionK(0.0), multiplier(1.0),
          depositedMass(0.0) {}

    AerosolSurface(int zone, int spec, double dVel, double As,
                   double resuspK = 0.0, double mult = 1.0)
        : zoneIdx(zone), speciesIdx(spec), depositionVelocity(dVel),
          surfaceArea(As), resuspensionK(resuspK), multiplier(mult),
          depositedMass(0.0) {}

    // Deposition removal rate coefficient (1/s) for the zone
    // This goes into the [A] diagonal: A(eq,eq) += depositionRate * V
    // where depositionRate = d * mult * A_s / V  (1/s, concentration-dependent removal)
    double getDepositionCoeff() const {
        return multiplier * depositionVelocity * surfaceArea;
    }

    // Resuspension generation rate (kg/s)
    // E_rate = K * A_s * M_dep / V  (but we return the absolute rate in kg/s)
    // Goes to RHS [b] vector
    double getResuspensionRate(double zoneVolume) const {
        if (resuspensionK <= 0.0 || depositedMass <= 0.0 || zoneVolume <= 0.0)
            return 0.0;
        return resuspensionK * surfaceArea * depositedMass / zoneVolume;
    }

    // Update deposited mass after a timestep
    // depositionFlux = d * A_s * C * dt  (mass deposited this step)
    // resuspensionFlux = resuspensionRate * dt (mass removed from surface)
    void updateDeposited(double airConc, double zoneVolume, double dt) {
        double depFlux = depositionVelocity * surfaceArea * multiplier * airConc * dt;
        double resFlux = getResuspensionRate(zoneVolume) * dt;
        depositedMass += depFlux - resFlux;
        if (depositedMass < 0.0) depositedMass = 0.0;
    }
};

} // namespace contam
