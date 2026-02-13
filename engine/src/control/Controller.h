#pragma once

#include <string>
#include <algorithm>

namespace contam {

// Incremental PI Controller
// output = clamp(output_prev + Kp*(e - e_prev) + Ki*dt*e, 0, 1)
// With deadband: if |e| < deadband, treat e as 0
class Controller {
public:
    int id;
    std::string name;
    int sensorId;       // which sensor provides input
    int actuatorId;     // which actuator receives output
    double setpoint;    // target value for the sensor reading
    double Kp;          // proportional gain
    double Ki;          // integral gain (1/s)
    double deadband;    // deadband around setpoint (no action if |error| < deadband)
    double outputMin;   // minimum output (default 0)
    double outputMax;   // maximum output (default 1)

    // Internal state
    double output;      // current output value [outputMin, outputMax]
    double prevError;   // previous error for incremental form
    double integral;    // accumulated integral term

    Controller()
        : id(0), sensorId(0), actuatorId(0), setpoint(0),
          Kp(1.0), Ki(0.0), deadband(0.0),
          outputMin(0.0), outputMax(1.0),
          output(0.0), prevError(0.0), integral(0.0) {}

    Controller(int id, const std::string& name, int sensorId, int actuatorId,
               double setpoint, double Kp, double Ki = 0.0, double deadband = 0.0)
        : id(id), name(name), sensorId(sensorId), actuatorId(actuatorId),
          setpoint(setpoint), Kp(Kp), Ki(Ki), deadband(deadband),
          outputMin(0.0), outputMax(1.0),
          output(0.0), prevError(0.0), integral(0.0) {}

    // Update controller output given current sensor reading and timestep
    double update(double sensorValue, double dt) {
        double error = setpoint - sensorValue;

        // Apply deadband
        if (std::abs(error) < deadband) {
            error = 0.0;
        }

        // Incremental PI
        integral += error * dt;
        double rawOutput = Kp * error + Ki * integral;

        // Clamp output
        output = std::clamp(rawOutput, outputMin, outputMax);

        // Anti-windup: if output is saturated, stop integrating
        if (output != rawOutput) {
            integral -= error * dt;  // undo the integration that caused saturation
        }

        prevError = error;
        return output;
    }

    void reset() {
        output = 0.0;
        prevError = 0.0;
        integral = 0.0;
    }
};

} // namespace contam
