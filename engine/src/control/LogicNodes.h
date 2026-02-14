#pragma once

#include <string>
#include <vector>
#include <cmath>
#include <algorithm>
#include <numeric>

namespace contam {

// Base class for logic/math operation nodes in the control network
class LogicNode {
public:
    virtual ~LogicNode() = default;
    virtual double evaluate(const std::vector<double>& inputs) const = 0;
    virtual std::string typeName() const = 0;
};

// Boolean AND: output = 1.0 if ALL inputs > 0.5, else 0.0
class AndNode : public LogicNode {
public:
    double evaluate(const std::vector<double>& inputs) const override {
        for (double v : inputs) {
            if (v <= 0.5) return 0.0;
        }
        return 1.0;
    }
    std::string typeName() const override { return "AND"; }
};

// Boolean OR: output = 1.0 if ANY input > 0.5, else 0.0
class OrNode : public LogicNode {
public:
    double evaluate(const std::vector<double>& inputs) const override {
        for (double v : inputs) {
            if (v > 0.5) return 1.0;
        }
        return 0.0;
    }
    std::string typeName() const override { return "OR"; }
};

// Boolean XOR: output = 1.0 if ODD number of inputs > 0.5
class XorNode : public LogicNode {
public:
    double evaluate(const std::vector<double>& inputs) const override {
        int count = 0;
        for (double v : inputs) {
            if (v > 0.5) ++count;
        }
        return (count % 2 == 1) ? 1.0 : 0.0;
    }
    std::string typeName() const override { return "XOR"; }
};

// Boolean NOT: output = 1.0 if first input <= 0.5, else 0.0
class NotNode : public LogicNode {
public:
    double evaluate(const std::vector<double>& inputs) const override {
        if (inputs.empty()) return 1.0;
        return (inputs[0] <= 0.5) ? 1.0 : 0.0;
    }
    std::string typeName() const override { return "NOT"; }
};

// Sum: output = sum of all inputs
class SumNode : public LogicNode {
public:
    double evaluate(const std::vector<double>& inputs) const override {
        return std::accumulate(inputs.begin(), inputs.end(), 0.0);
    }
    std::string typeName() const override { return "SUM"; }
};

// Average: output = mean of all inputs
class AverageNode : public LogicNode {
public:
    double evaluate(const std::vector<double>& inputs) const override {
        if (inputs.empty()) return 0.0;
        return std::accumulate(inputs.begin(), inputs.end(), 0.0) / static_cast<double>(inputs.size());
    }
    std::string typeName() const override { return "AVG"; }
};

// Min: output = minimum of all inputs
class MinNode : public LogicNode {
public:
    double evaluate(const std::vector<double>& inputs) const override {
        if (inputs.empty()) return 0.0;
        return *std::min_element(inputs.begin(), inputs.end());
    }
    std::string typeName() const override { return "MIN"; }
};

// Max: output = maximum of all inputs
class MaxNode : public LogicNode {
public:
    double evaluate(const std::vector<double>& inputs) const override {
        if (inputs.empty()) return 0.0;
        return *std::max_element(inputs.begin(), inputs.end());
    }
    std::string typeName() const override { return "MAX"; }
};

// Exponential: output = exp(input[0])
class ExpNode : public LogicNode {
public:
    double evaluate(const std::vector<double>& inputs) const override {
        if (inputs.empty()) return 1.0;
        return std::exp(inputs[0]);
    }
    std::string typeName() const override { return "EXP"; }
};

// Natural Log: output = ln(input[0]), clamped to avoid -inf
class LnNode : public LogicNode {
public:
    double evaluate(const std::vector<double>& inputs) const override {
        if (inputs.empty()) return 0.0;
        double v = std::max(1e-30, inputs[0]);
        return std::log(v);
    }
    std::string typeName() const override { return "LN"; }
};

// Absolute Value: output = |input[0]|
class AbsNode : public LogicNode {
public:
    double evaluate(const std::vector<double>& inputs) const override {
        if (inputs.empty()) return 0.0;
        return std::abs(inputs[0]);
    }
    std::string typeName() const override { return "ABS"; }
};

// Multiply: output = product of all inputs
class MultiplyNode : public LogicNode {
public:
    double evaluate(const std::vector<double>& inputs) const override {
        if (inputs.empty()) return 0.0;
        double result = 1.0;
        for (double v : inputs) result *= v;
        return result;
    }
    std::string typeName() const override { return "MUL"; }
};

// Divide: output = input[0] / input[1] (safe division)
class DivideNode : public LogicNode {
public:
    double evaluate(const std::vector<double>& inputs) const override {
        if (inputs.size() < 2) return 0.0;
        if (std::abs(inputs[1]) < 1e-30) return 0.0;
        return inputs[0] / inputs[1];
    }
    std::string typeName() const override { return "DIV"; }
};

// Integrator: accumulates input[0] * dt over time
// Must be reset and stepped externally
class IntegratorNode : public LogicNode {
public:
    IntegratorNode() : accumulated_(0.0), dt_(1.0) {}

    void setTimeStep(double dt) { dt_ = dt; }
    void reset() { accumulated_ = 0.0; }

    double evaluate(const std::vector<double>& inputs) const override {
        if (inputs.empty()) return accumulated_;
        // Note: accumulation happens in step(), evaluate just returns current value
        return accumulated_;
    }

    void step(double input) {
        accumulated_ += input * dt_;
    }

    std::string typeName() const override { return "INT"; }

private:
    double accumulated_;
    double dt_;
};

// Moving Average: averages last N samples of input[0]
class MovingAverageNode : public LogicNode {
public:
    explicit MovingAverageNode(int windowSize = 10)
        : windowSize_(std::max(1, windowSize)) {}

    double evaluate(const std::vector<double>& inputs) const override {
        if (buffer_.empty()) return inputs.empty() ? 0.0 : inputs[0];
        double sum = std::accumulate(buffer_.begin(), buffer_.end(), 0.0);
        return sum / static_cast<double>(buffer_.size());
    }

    void addSample(double value) {
        buffer_.push_back(value);
        if (static_cast<int>(buffer_.size()) > windowSize_) {
            buffer_.erase(buffer_.begin());
        }
    }

    std::string typeName() const override { return "MAVG"; }

private:
    int windowSize_;
    mutable std::vector<double> buffer_;
};

} // namespace contam
