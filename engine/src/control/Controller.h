#pragma once

#include <string>
#include <algorithm>
#include <cmath>

namespace contam {

// Incremental PI Controller (CONTAM standard)
//
// Formula per CONTAM requirements document:
//   output_t = output_{t-1} + Kp*(e_t - e_{t-1}) + Ki*(e_t + e_{t-1})
//
// Where:
//   e_t = setpoint - sensorValue  (error signal)
//   Ki already absorbs the dt/2 factor (user-configured parameter)
//   Output is hard-clamped to [0.0, 1.0]
//
// Deadband: if |e_t| < deadband, treat e_t as 0 (prevent high-frequency chatter)
class Controller {
public:
    int id;
    std::string name;
    int sensorId;       // which sensor provides input
    int actuatorId;     // which actuator receives output
    double setpoint;    // target value for the sensor reading
    double Kp;          // proportional gain
    double Ki;          // integral gain (absorbs dt/2 factor per CONTAM convention)
    double deadband;    // deadband around setpoint (no action if |error| < deadband)
    double outputMin;   // minimum output (default 0)
    double outputMax;   // maximum output (default 1)

    // Internal state
    double output;      // current output value [outputMin, outputMax]
    double prevError;   // previous error for incremental form

    Controller()
        : id(0), sensorId(0), actuatorId(0), setpoint(0),
          Kp(1.0), Ki(0.0), deadband(0.0),
          outputMin(0.0), outputMax(1.0),
          output(0.0), prevError(0.0) {}

    Controller(int id, const std::string& name, int sensorId, int actuatorId,
               double setpoint, double Kp, double Ki = 0.0, double deadband = 0.0)
        : id(id), name(name), sensorId(sensorId), actuatorId(actuatorId),
          setpoint(setpoint), Kp(Kp), Ki(Ki), deadband(deadband),
          outputMin(0.0), outputMax(1.0),
          output(0.0), prevError(0.0) {}

    // Update controller output given current sensor reading
    // Uses CONTAM incremental PI formula:
    //   output_t = output_{t-1} + Kp*(e_t - e_{t-1}) + Ki*(e_t + e_{t-1})
    double update(double sensorValue, double /*dt*/) {
        double error = setpoint - sensorValue;

        // Apply deadband
        if (std::abs(error) < deadband) {
            error = 0.0;
        }

        // Incremental PI (CONTAM standard formula)
        double increment = Kp * (error - prevError) + Ki * (error + prevError);
        double rawOutput = output + increment;

        // Hard clamp to [outputMin, outputMax]
        output = std::clamp(rawOutput, outputMin, outputMax);

        prevError = error;
        return output;
    }

    void reset() {
        output = 0.0;
        prevError = 0.0;
    }
};

} // namespace contam
