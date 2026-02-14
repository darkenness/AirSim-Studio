cmake_minimum_required(VERSION 3.20)
project(contam-engine VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# ── Dependencies via FetchContent ──────────────────────────────────────
include(FetchContent)

# Eigen 3 (header-only linear algebra)
FetchContent_Declare(
    eigen
    GIT_REPOSITORY https://gitlab.com/libeigen/eigen.git
    GIT_TAG        3.4.0
    GIT_SHALLOW    TRUE
)

# nlohmann/json (header-only JSON)
FetchContent_Declare(
    json
    GIT_REPOSITORY https://github.com/nlohmann/json.git
    GIT_TAG        v3.11.3
    GIT_SHALLOW    TRUE
)

# Google Test
FetchContent_Declare(
    googletest
    GIT_REPOSITORY https://github.com/google/googletest.git
    GIT_TAG        v1.14.0
    GIT_SHALLOW    TRUE
)

# Prevent GTest from overriding compiler/linker settings on Windows
set(gtest_force_shared_crt ON CACHE BOOL "" FORCE)

# pybind11 (Python bindings)
FetchContent_Declare(
    pybind11
    GIT_REPOSITORY https://github.com/pybind/pybind11.git
    GIT_TAG        v2.11.1
    GIT_SHALLOW    TRUE
)

# HighFive (header-only HDF5 C++ wrapper) - optional
option(CONTAM_ENABLE_HDF5 "Enable HDF5 output support" OFF)

FetchContent_MakeAvailable(eigen json googletest pybind11)

if(CONTAM_ENABLE_HDF5)
    find_package(HDF5 REQUIRED COMPONENTS C)
    FetchContent_Declare(
        highfive
        GIT_REPOSITORY https://github.com/BlueBrain/HighFive.git
        GIT_TAG        v2.9.0
        GIT_SHALLOW    TRUE
    )
    set(HIGHFIVE_USE_EIGEN OFF CACHE BOOL "" FORCE)
    set(HIGHFIVE_UNIT_TESTS OFF CACHE BOOL "" FORCE)
    set(HIGHFIVE_EXAMPLES OFF CACHE BOOL "" FORCE)
    FetchContent_MakeAvailable(highfive)
endif()

# ── Engine Library ─────────────────────────────────────────────────────
set(ENGINE_SOURCES
    src/core/Node.cpp
    src/core/Link.cpp
    src/core/Network.cpp
    src/core/Solver.cpp
    src/core/ContaminantSolver.cpp
    src/core/TransientSimulation.cpp
    src/elements/PowerLawOrifice.cpp
    src/elements/Fan.cpp
    src/elements/TwoWayFlow.cpp
    src/elements/Duct.cpp
    src/elements/Damper.cpp
    src/elements/Filter.cpp
    src/elements/SelfRegulatingVent.cpp
    src/elements/CheckValve.cpp
    src/io/JsonReader.cpp
    src/io/JsonWriter.cpp
    src/utils/Constants.cpp
)

add_library(contam_engine_lib STATIC ${ENGINE_SOURCES})

target_include_directories(contam_engine_lib PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/src
)

target_link_libraries(contam_engine_lib PUBLIC
    Eigen3::Eigen
    nlohmann_json::nlohmann_json
)

# ── CLI Executable ─────────────────────────────────────────────────────
add_executable(contam_engine src/main.cpp)
target_link_libraries(contam_engine PRIVATE contam_engine_lib)

# ── Tests ──────────────────────────────────────────────────────────────
enable_testing()

add_executable(contam_tests
    test/test_powerlaw.cpp
    test/test_network.cpp
    test/test_solver.cpp
    test/test_json.cpp
    test/test_contaminant.cpp
    test/test_elements.cpp
    test/test_control.cpp
    test/test_advanced.cpp
)

target_link_libraries(contam_tests PRIVATE
    contam_engine_lib
    GTest::gtest_main
)

include(GoogleTest)
gtest_discover_tests(contam_tests)

# ── Python Module ─────────────────────────────────────────────────────
pybind11_add_module(pycontam python/pycontam.cpp)
target_link_libraries(pycontam PRIVATE contam_engine_lib)
