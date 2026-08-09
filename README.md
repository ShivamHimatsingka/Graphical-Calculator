# 📈 Graphical Calculator

> A fast, interactive, Desmos-inspired graphing calculator built with Python.

A desktop graphing calculator designed for fast mathematical exploration, with interactive expressions, variables, sliders, points, curve tracking, and customizable graphs.

---

## ✨ Features

* 📏 Straight-line equations
* 📐 Quadratic equations
* 🔢 Polynomial functions
* 📊 Trigonometric functions
* 🔣 Logarithms
* √ Square roots
* ⚡ Exponential functions
* ➕ Multiple expressions
* 🎚️ Interactive variable sliders
* 🔄 Two-way slider/variable synchronization
* 🎨 Custom equation colours
* 📍 User-defined points
* 🖱️ Curve tracking
* 🔍 Zoom and pan
* 👁️ Show/hide expressions
* 🗑️ Delete expressions
* ⚡ Debounced live updates
* 🚀 Performance optimizations

---

## 🖥️ Preview

<p align="center">
  <img src="screenshots/preview.png" width="850">
</p>

---

## 🚀 Installation

### Requirements

* Python 3.10+
* macOS, Windows, or Linux

Check your Python version:

```bash
python --version
```

### Clone the repository

```bash
git clone https://github.com/ShivamHimatsingka/Graphical-Calculator.git
cd Graphical-Calculator
```

### Install dependencies

```bash
pip install PySide6 pyqtgraph numpy sympy
```

### Run

```bash
python main.py
```

If your system uses `python3`:

```bash
python3 main.py
```

---

## 📐 Supported Expressions

### Straight Lines

```text
y = 2x + 3
y = -x + 5
```

### Quadratics

```text
y = x^2
y = x^2 + 2x + 1
y = -2x^2 + 4x - 3
```

### Polynomials

```text
y = x^3 - 2x^2 + x
y = 2x^4 - x^2 + 3
```

### Trigonometry

```text
y = sin(x)
y = cos(x)
y = tan(x)
```

Inverse trigonometric functions:

```text
y = asin(x)
y = acos(x)
y = atan(x)
```

### Logarithms

```text
y = log(x)
y = ln(x)
```

### Other Functions

```text
y = sqrt(x)
y = exp(x)
```

Constants such as `pi` and `e` are also supported.

---

## 🎚️ Interactive Sliders

Variables can be defined directly in the expression list.

```text
a = 1
```

The calculator creates an interactive slider for the variable.

You can then use it in an equation:

```text
y = ax^2
```

Moving the slider changes `a` and automatically updates the graph.

### Two-way synchronization

The slider and variable value stay synchronized.

Moving the slider:

```text
a = 1
↓
a = 3.5
```

Or editing the variable manually:

```text
a = 7
```

will also update the slider.

---

## 📍 Points

Define points using:

```text
A = (2, 3)
```

or:

```text
B = (-4, 5)
```

Points are displayed directly on the graph.

Variables can also be used:

```text
a = 2
A = (a, a^2)
```

Changing `a` automatically moves the point.

---

## 🖱️ Curve Tracking

Move the cursor over a plotted curve to inspect the corresponding coordinates.

The calculator finds the nearest point on the curve and displays its position.

Example:

```text
(2.15, 4.62)
```

---

## 🎨 Equation Colours

Each expression can have its own colour.

This makes it easier to distinguish multiple equations on the same graph.

For example:

```text
y = x^2
y = 2x + 1
y = sin(x)
```

can each be displayed using different colours.

---

## 🔍 Graph Controls

### Zoom

Use the mouse wheel over the graph.

### Pan

Click and drag the graph.

### Reset

Reset the graph view to the default coordinate range.

---

## ⚡ Performance

The calculator is designed to remain responsive during interactive use.

### Debounced Updates

Expressions are not recalculated unnecessarily on every keystroke.

### NumPy

Used for fast numerical calculations and evaluating graph points.

### PyQtGraph

Provides fast interactive graph rendering.

### SymPy

Handles mathematical expression parsing and conversion.

### Optimized Updates

Graph elements are updated only when necessary, helping keep expression editing and sliders responsive.

---

## 🧩 Built With

| Technology   | Purpose               |
| ------------ | --------------------- |
| 🐍 Python    | Core application      |
| 🎨 PySide6   | User interface        |
| 📈 PyQtGraph | Graph rendering       |
| 🔢 NumPy     | Numerical computation |
| 🧮 SymPy     | Mathematical parsing  |

Install all dependencies with:

```bash
pip install PySide6 pyqtgraph numpy sympy
```

---

## 📁 Project Structure

```text
Graphical-Calculator/
│
├── main.py
├── README.md
├── LICENSE
├── .gitignore
│
└── screenshots/
    └── preview.png
```

---

## 🛠️ Roadmap

Future improvements may include:

* [ ] Derivatives
* [ ] Integrals
* [ ] Tangent lines
* [ ] Secant lines
* [ ] Intersections
* [ ] Roots / zeros
* [ ] Inequalities
* [ ] Filled regions
* [ ] Parametric equations
* [ ] Polar equations
* [ ] Regression
* [ ] Statistics
* [ ] Animated sliders
* [ ] Adjustable slider ranges
* [ ] Undo / redo
* [ ] Save and load graphs
* [ ] Export graphs as images
* [ ] Keyboard shortcuts
* [ ] Dark mode
* [ ] Improved Desmos-style interface
* [ ] LaTeX equation rendering
* [ ] GPU-accelerated rendering

---

## 🐛 Troubleshooting

### `ModuleNotFoundError`

If you see:

```text
ModuleNotFoundError: No module named 'PySide6'
```

install the dependencies:

```bash
pip install PySide6 pyqtgraph numpy sympy
```

Or:

```bash
python3 -m pip install PySide6 pyqtgraph numpy sympy
```

Then run:

```bash
python main.py
```

### Check Python Version

```bash
python --version
```

Python 3.10 or newer is recommended.

---

## 🤝 Contributing

Contributions, suggestions, and bug reports are welcome.

### Fork the repository

```bash
git clone https://github.com/ShivamHimatsingka/Graphical-Calculator.git
cd Graphical-Calculator
```

### Create a branch

```bash
git checkout -b feature/my-feature
```

### Make your changes

### Commit

```bash
git commit -m "Add new feature"
```

### Push

```bash
git push origin feature/my-feature
```

Then open a Pull Request.

---

## 🐞 Reporting Bugs

When opening an issue, please include:

* Operating system
* Python version
* Error message
* Steps to reproduce
* Screenshot, if applicable

---

## 📄 License

This project is licensed under the MIT License.

See [`LICENSE`](LICENSE) for details.

---

## 👨‍💻 Author

**Shivam Himatsingka**

Built with Python, mathematics, and a lot of experimentation.

---

<p align="center">

⭐ **If you like this project, consider giving it a star!**

<br>

**Python • PySide6 • PyQtGraph • NumPy • SymPy**

</p>
