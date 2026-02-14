#pragma once

#include <vector>
#include <string>

namespace contam {

// First-order chemical kinetics reaction matrix
//
// Per CONTAM requirements document (Module 8.1):
//   dC_α/dt = Σ_β K_{α,β} * C_β
//
// K_{α,β} is the first-order rate constant (1/s) for species β producing species α.
// Diagonal elements K_{α,α} represent self-decay (negative = consumption).
//
// The reaction matrix is embedded into the implicit contaminant transport solver
// by modifying the [A] matrix:
//   - Off-diagonal: A_{α,β} -= K_{α,β} * V_i  (production of α from β)
//   - Diagonal: A_{α,α} += |K_{α,α}| * V_i    (consumption of α)
//
// This ensures stability even for fast reactions.

struct ChemicalReaction {
    int fromSpeciesIdx;   // source species β
    int toSpeciesIdx;     // product species α
    double rateConstant;  // K_{α,β} in 1/s (positive = production rate)

    ChemicalReaction() : fromSpeciesIdx(0), toSpeciesIdx(0), rateConstant(0.0) {}
    ChemicalReaction(int from, int to, double rate)
        : fromSpeciesIdx(from), toSpeciesIdx(to), rateConstant(rate) {}
};

// Reaction network: collection of first-order reactions
class ReactionNetwork {
public:
    ReactionNetwork() = default;

    void addReaction(const ChemicalReaction& rxn) { reactions_.push_back(rxn); }
    void addReaction(int fromIdx, int toIdx, double rate) {
        reactions_.emplace_back(fromIdx, toIdx, rate);
    }

    const std::vector<ChemicalReaction>& getReactions() const { return reactions_; }
    bool empty() const { return reactions_.empty(); }
    size_t size() const { return reactions_.size(); }

    // Get the full reaction rate matrix K[to][from] for numSpecies
    // Returns a 2D vector where K[α][β] = rate constant for β→α
    std::vector<std::vector<double>> buildMatrix(int numSpecies) const {
        std::vector<std::vector<double>> K(numSpecies, std::vector<double>(numSpecies, 0.0));
        for (const auto& rxn : reactions_) {
            if (rxn.fromSpeciesIdx >= 0 && rxn.fromSpeciesIdx < numSpecies &&
                rxn.toSpeciesIdx >= 0 && rxn.toSpeciesIdx < numSpecies) {
                K[rxn.toSpeciesIdx][rxn.fromSpeciesIdx] += rxn.rateConstant;
            }
        }
        return K;
    }

private:
    std::vector<ChemicalReaction> reactions_;
};

} // namespace contam
