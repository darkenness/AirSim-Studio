#pragma once

#include "elements/FlowElement.h"
#include "utils/Constants.h"
#include <cmath>

namespace contam {

// Backdraft Damper: different power-law coefficients for forward vs reverse flow
// Forward (ΔP > 0): ṁ = ρ · Cf · |ΔP|^nf · sign(ΔP)
// Reverse (ΔP < 0): ṁ = ρ · Cr · |ΔP|^nr · sign(ΔP)
// Typically Cr << Cf (nearly closed in reverse direction)
class BackdraftDamper : public FlowElement {
public:
    // Cf, nf: forward flow coefficient and exponent
    // Cr, nr: reverse flow coefficient and exponent
    BackdraftDamper(double Cf, double nf, double Cr, double nr);

    FlowResult calculate(double deltaP, double density) const override;
    std::string typeName() const override { return "BackdraftDamper"; }
    std::unique_ptr<FlowElement> clone() const override;

    double getForwardC() const { return Cf_; }
    double getForwardN() const { return nf_; }
    double getReverseC() const { return Cr_; }
    double getReverseN() const { return nr_; }

private:
    double Cf_, nf_;  // forward
    double Cr_, nr_;  // reverse
    double linearSlopeFwd_;
    double linearSlopeRev_;
};

} // namespace contam
