#pragma once
#include <vector>
#include <cmath>
#include <algorithm>
#include <stdexcept>

namespace contam {

class OneDZone {
public:
    OneDZone(int numCells, double length, double crossSectionArea, int numSpecies);

    // Advance one time step using explicit upwind finite volume
    // flowRate: bulk flow through zone (kg/s), positive = left->right
    // diffCoeffs: diffusion coefficient per species (m^2/s)
    // leftBC, rightBC: boundary concentrations per species
    void step(double dt, double flowRate, double density,
              const std::vector<double>& diffCoeffs,
              const std::vector<double>& leftBC,
              const std::vector<double>& rightBC);

    // Get concentration at cell i for species s
    double getConcentration(int cell, int species) const;

    // Set concentration
    void setConcentration(int cell, int species, double value);

    // Get average concentration across all cells for species s
    double getAverageConcentration(int species) const;

    // CFL stability limit
    double getMaxTimeStep(double flowRate, double density, double maxDiffCoeff) const;

    int numCells() const { return numCells_; }
    int numSpecies() const { return numSpecies_; }
    double length() const { return length_; }
    double crossSectionArea() const { return area_; }

private:
    int numCells_;
    int numSpecies_;
    double length_;
    double area_;
    double dx_;  // cell size = length / numCells

    // concentrations_[cell * numSpecies + species]
    std::vector<double> concentrations_;
};

} // namespace contam
