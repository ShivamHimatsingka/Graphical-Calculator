# Graphical-Calculator
# 📈 Python Graphing Calculator

> A fast, interactive, Desmos-inspired graphing calculator built with Python.

Plot equations, manipulate variables with interactive sliders, track points on curves, customize equation colours, and explore graphs with smooth zooming and panning — all from a native Python GUI.

---

## ✨ Features

| Feature | Supported |
|---|:---:|
| 📏 Straight lines | ✅ |
| 📐 Quadratic equations | ✅ |
| 🔢 Polynomial functions | ✅ |
| 📈 Multiple expressions | ✅ |
| 📊 Trigonometric functions | ✅ |
| 🔣 Logarithms | ✅ |
| √ Square roots | ✅ |
| ⚡ Exponential functions | ✅ |
| 🎚️ Interactive sliders | ✅ |
| 🎨 Custom equation colours | ✅ |
| 🖱️ Curve tracking | ✅ |
| 📍 Coordinate points | ✅ |
| 🔍 Zoom & pan | ✅ |
| 👁️ Show / hide expressions | ✅ |
| 🗑️ Delete expressions | ✅ |
| ⚡ Debounced live updates | ✅ |
| 🚀 Cached calculations | ✅ |

---

## 🚀 Getting Started

### Requirements

- **Python 3.10+**
- macOS, Windows, or Linux

Check your Python version & install dependencies:

```bash
python3 --version
pip install PySide6 pyqtgraph numpy sympy

📦 Installation
1. Clone the repository
git clone https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
Enter the project directory:
cd YOUR-REPOSITORY
2. Install dependencies
Install all required packages with:
pip install PySide6 pyqtgraph numpy sympy
If your system uses pip3:
pip3 install PySide6 pyqtgraph numpy sympy
3. Run the application
python main.py
Or:
python3 main.py
The graphing calculator window should open.
📐 Plotting Expressions
Enter mathematical expressions into the expression list.
Straight Lines
y = 2x + 3
y = -x + 5
Quadratics
y = x^2
y = x^2 + 2x + 1
y = -2x^2 + 4x - 3
Polynomials
y = x^3 - 2x^2 + x
y = 2x^4 - x^2 + 3
📊 Trigonometric Functions
The calculator supports common trigonometric functions:
y = sin(x)
y = cos(x)
y = tan(x)
Inverse trigonometric functions are also supported:
y = asin(x)
y = acos(x)
y = atan(x)
🔣 Logarithms & Other Functions
Logarithms
y = log(x)
y = ln(x)
Square Roots
y = sqrt(x)
Exponentials
y = exp(x)
Constants
pi
e
➕ Multiple Expressions
Multiple equations can be plotted at the same time.
For example:
y = x^2
y = 2x + 1
y = sin(x)
Each expression is rendered independently on the graph.
You can:
Add expressions
Delete expressions
Hide/show expressions
Change their colours
Edit expressions while the graph is running
🎚️ Interactive Sliders
Variables can be defined directly in the expression list.
For example:
a = 1
The calculator creates an interactive slider for a.
You can then use the variable in another equation:
y = ax^2
Moving the slider changes the value of a and updates the graph.
For example:
a = 1
can become:
a = 2.5
and the graph automatically changes from:
y = x^2
to:
y = 2.5x^2
🔄 Two-Way Variable Synchronization
Variables work in both directions.
Move the slider
Slider → a = 4.5
The expression updates automatically.
Edit the variable manually
a = 7
The slider automatically moves to the new value.
This keeps the displayed variable value and slider synchronized.
📍 Points
Define points using:
A = (2, 3)
or:
B = (-4, 5)
The point is displayed directly on the graph.
Variables can also be used:
a = 2
A = (a, a^2)
Changing a moves the point automatically.
🖱️ Curve Tracking
Move the mouse over a plotted curve to inspect its coordinates.
The calculator finds the nearest point on the curve and displays its coordinates.
Example:
(2.15, 4.62)
A tracking indicator makes it easier to follow the curve.
🎨 Equation Colours
Every expression has its own colour.
You can choose a custom colour for each equation.
For example:
y = x^2
y = 2x + 1
y = sin(x)
Each equation can have a different colour, making multiple graphs easier to distinguish.
🔍 Graph Controls
Zoom
Use the mouse wheel over the graph to zoom in and out.
Pan
Click and drag the graph to move around the coordinate plane.
Reset View
Reset the graph to the default view when needed.
⚡ Performance
The calculator is designed to remain responsive during interactive use.
Debounced Live Updates
Expressions are not unnecessarily recalculated on every single keystroke.
The calculator waits briefly after editing before performing the graph calculation.
NumPy
NumPy is used for efficient numerical calculations and evaluating large arrays of graph points.
PyQtGraph
PyQtGraph provides fast real-time graph rendering.
SymPy
SymPy handles mathematical expression parsing and conversion.
Optimized Updates
Only the necessary graph elements are updated when expressions or variables change.
This helps keep sliders, editing, zooming, and panning responsive.
🧩 Technology Stack
Technology	Purpose
🐍 Python	Core application
🎨 PySide6	Graphical user interface
📈 PyQtGraph	Interactive graph rendering
🔢 NumPy	Numerical computation
🧮 SymPy	Mathematical expression parsing
Install everything with:
pip install PySide6 pyqtgraph numpy sympy
📁 Project Structure
PythonGraphingCalculator/
│
├── main.py
├── README.md
├── LICENSE
├── .gitignore
│
└── screenshots/
    └── preview.png
🛠️ Roadmap
The project is actively being developed.
Planned Features
 Derivatives
 Integrals
 Tangent lines
 Secant lines
 Intersections
 Roots / zeros
 Inequalities
 Filled regions
 Parametric equations
 Polar equations
 Regression
 Statistics
 Animated sliders
 Adjustable slider ranges
 Undo / redo
 Save graphs
 Load graphs
 Export graphs as images
 Keyboard shortcuts
 Dark mode
 Improved Desmos-style interface
 LaTeX equation rendering
 GPU-accelerated rendering
🐛 Troubleshooting
ModuleNotFoundError
If you get an error such as:
ModuleNotFoundError: No module named 'PySide6'
install the dependencies:
pip install PySide6 pyqtgraph numpy sympy
If you are using Python 3:
python3 -m pip install PySide6 pyqtgraph numpy sympy
Then run:
python main.py
Python Version
Check your installed Python version:
python --version
Python 3.10 or newer is recommended.
🤝 Contributing
Contributions, suggestions, and bug reports are welcome.
Fork the repository
git clone https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
Create a branch
git checkout -b feature/my-feature
Make your changes
Commit your changes
git commit -m "Add new feature"
Push the branch
git push origin feature/my-feature
Then open a Pull Request on GitHub.
🐞 Reporting Bugs
If you find a bug, open a GitHub Issue and include:
Operating system
Python version
Error message
Steps to reproduce the issue
Screenshot, if applicable
