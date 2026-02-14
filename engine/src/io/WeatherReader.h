#pragma once

#include <string>
#include <vector>
#include <fstream>
#include <sstream>
#include <stdexcept>

namespace contam {

// Hourly weather data record
struct WeatherRecord {
    int month, day, hour;
    double temperature;    // K (converted from °C)
    double windSpeed;      // m/s
    double windDirection;  // degrees (0=N, 90=E, 180=S, 270=W)
    double pressure;       // Pa (absolute)
    double humidity;       // relative humidity (0~1)
};

// WTH Weather File Reader
// Parses CONTAM-style weather files (.wth)
// Format: header line + hourly records
// Each record: month day hour Tamb(°C) Patm(Pa) Ws(m/s) Wd(deg) [RH(%)]
class WeatherReader {
public:
    // Read weather file and return sorted records
    static std::vector<WeatherRecord> readFile(const std::string& filepath) {
        std::ifstream file(filepath);
        if (!file.is_open()) {
            throw std::runtime_error("Cannot open weather file: " + filepath);
        }

        std::vector<WeatherRecord> records;
        std::string line;

        // Skip header lines (lines starting with ! or # or non-numeric)
        while (std::getline(file, line)) {
            if (line.empty() || line[0] == '!' || line[0] == '#') continue;
            // Check if line starts with a digit
            if (std::isdigit(static_cast<unsigned char>(line[0]))) {
                // Parse data line
                WeatherRecord rec;
                std::istringstream iss(line);
                double tempC;
                double rhPercent = 50.0;

                if (iss >> rec.month >> rec.day >> rec.hour >> tempC >> rec.pressure
                        >> rec.windSpeed >> rec.windDirection) {
                    rec.temperature = tempC + 273.15; // °C → K
                    if (iss >> rhPercent) {
                        rec.humidity = rhPercent / 100.0;
                    } else {
                        rec.humidity = 0.5; // default
                    }
                    records.push_back(rec);
                }
            }
        }
        return records;
    }

    // Convert weather records to simulation time (seconds from start)
    // Assumes records are hourly, starting from Jan 1 hour 1
    static double recordToTime(const WeatherRecord& rec) {
        // Approximate: assume 30-day months for simplicity
        int dayOfYear = (rec.month - 1) * 30 + rec.day;
        return (dayOfYear - 1) * 86400.0 + (rec.hour - 1) * 3600.0;
    }

    // Interpolate weather at arbitrary time from sorted records
    static WeatherRecord interpolate(const std::vector<WeatherRecord>& records, double t) {
        if (records.empty()) {
            return {1, 1, 1, 283.15, 0.0, 0.0, 101325.0, 0.5};
        }
        if (records.size() == 1) return records[0];

        // Find bracketing records
        double t0 = recordToTime(records.front());
        double tN = recordToTime(records.back());

        if (t <= t0) return records.front();
        if (t >= tN) return records.back();

        for (size_t i = 0; i < records.size() - 1; ++i) {
            double ti = recordToTime(records[i]);
            double ti1 = recordToTime(records[i + 1]);
            if (t >= ti && t <= ti1) {
                double dt = ti1 - ti;
                double alpha = (dt > 0) ? (t - ti) / dt : 0.0;
                WeatherRecord result;
                result.month = records[i].month;
                result.day = records[i].day;
                result.hour = records[i].hour;
                result.temperature = records[i].temperature * (1 - alpha) + records[i + 1].temperature * alpha;
                result.windSpeed = records[i].windSpeed * (1 - alpha) + records[i + 1].windSpeed * alpha;
                result.windDirection = records[i].windDirection * (1 - alpha) + records[i + 1].windDirection * alpha;
                result.pressure = records[i].pressure * (1 - alpha) + records[i + 1].pressure * alpha;
                result.humidity = records[i].humidity * (1 - alpha) + records[i + 1].humidity * alpha;
                return result;
            }
        }
        return records.back();
    }
};

} // namespace contam
