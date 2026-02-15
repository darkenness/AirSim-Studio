#include "core/OneDZone.h"

namespace contam {

OneDZone::OneDZone(int numCells, double length, double crossSectionArea, int numSpecies)
    : numCells_(numCells), numSpecies_(numSpecies), length_(length), area_(crossSectionArea)
{
    if (numCells <= 0 || length <= 0.0 || crossSectionArea <= 0.0 || numSpecies <= 0) {
        throw std::invalid_argument("OneDZone: all parameters must be positive");
    }
    dx_ = length_ / numCells_;
    concentrations_.resize(numCells_ * numSpecies_, 0.0);
}

void OneDZone::step(double dt, double flowRate, double density,
                    const std::vector<double>& diffCoeffs,
                    const std::vector<double>& leftBC,
                    const std::vector<double>& rightBC)
{
    if (density <= 0.0) return;

    double Vcell = area_ * dx_;
    double u = flowRate / (density * area_);  // velocity (m/s)

    // Work on a copy to avoid in-place corruption
    std::vector<double> newConc(concentrations_);

    for (int s = 0; s < numSpecies_; ++s) {
        double D = (s < static_cast<int>(diffCoeffs.size())) ? diffCoeffs[s] : 0.0;
        double cLeft = (s < static_cast<int>(leftBC.size())) ? leftBC[s] : 0.0;
        double cRight = (s < static_cast<int>(rightBC.size())) ? rightBC[s] : 0.0;

        for (int i = 0; i < numCells_; ++i) {
            double Ci = concentrations_[i * numSpecies_ + s];

            // --- Left face (i - 1/2) ---
            double cLeftNeighbor = (i > 0) ? concentrations_[(i - 1) * numSpecies_ + s] : cLeft;

            // Advective flux at left face (Patankar upwind)
            // F_left = max(u,0)*C_{i-1} + min(u,0)*C_i  (flux INTO cell from left)
            double advFluxLeft = std::max(u, 0.0) * cLeftNeighbor + std::min(u, 0.0) * Ci;

            // Diffusive flux at left face: D/dx * (C_{i-1} - C_i) directed into cell
            double diffFluxLeft = D / dx_ * (cLeftNeighbor - Ci);

            // --- Right face (i + 1/2) ---
            double cRightNeighbor = (i < numCells_ - 1) ? concentrations_[(i + 1) * numSpecies_ + s] : cRight;

            // Advective flux at right face (leaving cell)
            // F_right = max(u,0)*C_i + min(u,0)*C_{i+1}
            double advFluxRight = std::max(u, 0.0) * Ci + std::min(u, 0.0) * cRightNeighbor;

            // Diffusive flux at right face: D/dx * (C_i - C_{i+1}) directed out of cell
            double diffFluxRight = D / dx_ * (Ci - cRightNeighbor);

            // Net flux into cell = (left_in - right_out) * area
            double netAdvection = (advFluxLeft - advFluxRight) * area_;
            double netDiffusion = (diffFluxLeft - diffFluxRight) * area_;

            // Update: C_i^{n+1} = C_i^n + dt/V_cell * (net flux)
            newConc[i * numSpecies_ + s] = Ci + dt / Vcell * (netAdvection + netDiffusion);

            // Clamp to non-negative
            if (newConc[i * numSpecies_ + s] < 0.0) {
                newConc[i * numSpecies_ + s] = 0.0;
            }
        }
    }

    concentrations_ = newConc;
}

double OneDZone::getConcentration(int cell, int species) const {
    if (cell < 0 || cell >= numCells_ || species < 0 || species >= numSpecies_) {
        return 0.0;
    }
    return concentrations_[cell * numSpecies_ + species];
}

void OneDZone::setConcentration(int cell, int species, double value) {
    if (cell >= 0 && cell < numCells_ && species >= 0 && species < numSpecies_) {
        concentrations_[cell * numSpecies_ + species] = value;
    }
}

double OneDZone::getAverageConcentration(int species) const {
    if (species < 0 || species >= numSpecies_ || numCells_ == 0) return 0.0;
    double sum = 0.0;
    for (int i = 0; i < numCells_; ++i) {
        sum += concentrations_[i * numSpecies_ + species];
    }
    return sum / numCells_;
}

double OneDZone::getMaxTimeStep(double flowRate, double density, double maxDiffCoeff) const {
    double dtMax = 1e30;

    // Advection CFL: dt <= dx / |u|
    if (density > 0.0 && std::abs(flowRate) > 1e-30) {
        double u = std::abs(flowRate) / (density * area_);
        if (u > 1e-30) {
            dtMax = std::min(dtMax, dx_ / u);
        }
    }

    // Diffusion CFL: dt <= dx^2 / (2*D)
    if (maxDiffCoeff > 1e-30) {
        dtMax = std::min(dtMax, dx_ * dx_ / (2.0 * maxDiffCoeff));
    }

    return dtMax;
}

} // namespace contam
