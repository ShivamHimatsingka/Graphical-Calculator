import sys
import re
import math

import numpy as np
import sympy as sp

from PySide6.QtCore import (
    Qt,
    QTimer,
    Signal,
)
from PySide6.QtGui import (
    QFont,
    QColor,
)
from PySide6.QtWidgets import (
    QApplication,
    QMainWindow,
    QWidget,
    QVBoxLayout,
    QHBoxLayout,
    QLineEdit,
    QPushButton,
    QLabel,
    QFrame,
    QScrollArea,
    QSlider,
    QDoubleSpinBox,
    QColorDialog,
)

import pyqtgraph as pg


# ============================================================
# SYMBOLS
# ============================================================

X = sp.Symbol("x", real=True)
Y = sp.Symbol("y", real=True)


# ============================================================
# COLOURS
# ============================================================

COLORS = [
    "#c74440",
    "#2d70b3",
    "#388c46",
    "#6042a6",
    "#000000",
    "#ff9800",
    "#00897b",
    "#8e44ad",
    "#d81b60",
    "#546e7a",
]


# ============================================================
# SYMPY FUNCTIONS
# ============================================================

BASE_LOCALS = {
    "x": X,
    "y": Y,

    "sin": sp.sin,
    "cos": sp.cos,
    "tan": sp.tan,

    "asin": sp.asin,
    "acos": sp.acos,
    "atan": sp.atan,

    "arcsin": sp.asin,
    "arccos": sp.acos,
    "arctan": sp.atan,

    "sqrt": sp.sqrt,

    "log": sp.log,
    "ln": sp.log,

    "exp": sp.exp,

    "abs": sp.Abs,

    "pi": sp.pi,
    "π": sp.pi,

    "e": sp.E,
}


# ============================================================
# PARSER
# ============================================================

class Parser:

    @staticmethod
    def clean(text):

        text = text.strip()

        text = text.replace("π", "pi")
        text = text.replace("√", "sqrt")
        text = text.replace("−", "-")
        text = text.replace("×", "*")
        text = text.replace("÷", "/")
        text = text.replace("^", "**")

        return text

    @staticmethod
    def parse(
        text,
        variables=None,
    ):

        text = Parser.clean(text)

        if not text:
            return None

        local_dict = dict(BASE_LOCALS)

        if variables:
            local_dict.update(variables)

        try:

            transformations = (
                sp.parsing.sympy_parser.standard_transformations
                + (
                    sp.parsing.sympy_parser
                    .implicit_multiplication_application,
                )
            )

            expression = sp.parse_expr(
                text,
                local_dict=local_dict,
                transformations=transformations,
                evaluate=True,
            )

            return expression

        except Exception:

            return None


# ============================================================
# POINT
# ============================================================

class GraphPoint:

    def __init__(
        self,
        name,
        x,
        y,
    ):

        self.name = name
        self.x = x
        self.y = y


# ============================================================
# VARIABLE SLIDER
# ============================================================

class VariableSlider(QFrame):

    # Signal going from slider -> main calculator
    #
    # Sends:
    #
    # name
    # value
    #
    valueChanged = Signal(str, float)

    def __init__(
        self,
        name,
        value,
        parent=None,
    ):

        super().__init__(parent)

        self.name = name

        self.setFixedHeight(58)

        layout = QHBoxLayout(self)

        layout.setContentsMargins(
            45,
            0,
            8,
            2,
        )

        layout.setSpacing(8)

        # ----------------------------------------------------
        # Name
        # ----------------------------------------------------

        label = QLabel(name)

        label.setFixedWidth(22)

        layout.addWidget(label)

        # ----------------------------------------------------
        # Slider
        # ----------------------------------------------------

        self.slider = QSlider(
            Qt.Orientation.Horizontal
        )

        self.slider.setMinimum(-1000)
        self.slider.setMaximum(1000)

        self.slider.setValue(
            int(
                np.clip(
                    value,
                    -10,
                    10,
                ) * 100
            )
        )

        self.slider.valueChanged.connect(
            self.slider_position_changed
        )

        layout.addWidget(
            self.slider
        )

        # ----------------------------------------------------
        # Number
        # ----------------------------------------------------

        self.spin = QDoubleSpinBox()

        self.spin.setRange(
            -1000000,
            1000000,
        )

        self.spin.setDecimals(2)

        self.spin.setSingleStep(0.1)

        self.spin.setValue(
            value
        )

        self.spin.setFixedWidth(78)

        self.spin.valueChanged.connect(
            self.spin_value_changed
        )

        layout.addWidget(
            self.spin
        )

    # ========================================================
    # SLIDER -> VALUE
    # ========================================================

    def slider_position_changed(
        self,
        value,
    ):

        number = value / 100.0

        # Update spin box without triggering its signal
        self.spin.blockSignals(True)

        self.spin.setValue(
            number
        )

        self.spin.blockSignals(False)

        self.valueChanged.emit(
            self.name,
            number,
        )

    # ========================================================
    # VALUE -> SLIDER
    # ========================================================

    def spin_value_changed(
        self,
        value,
    ):

        self.slider.blockSignals(True)

        self.slider.setValue(
            int(
                np.clip(
                    value,
                    -10,
                    10,
                ) * 100
            )
        )

        self.slider.blockSignals(False)

        self.valueChanged.emit(
            self.name,
            float(value),
        )

    # ========================================================
    # SET VALUE FROM OUTSIDE
    # ========================================================

    def set_value(
        self,
        value,
    ):

        self.slider.blockSignals(True)
        self.spin.blockSignals(True)

        self.slider.setValue(
            int(
                np.clip(
                    value,
                    -10,
                    10,
                ) * 100
            )
        )

        self.spin.setValue(
            value
        )

        self.slider.blockSignals(False)
        self.spin.blockSignals(False)


# ============================================================
# EXPRESSION ROW
# ============================================================

class ExpressionRow(QFrame):

    def __init__(
        self,
        number,
        color,
        delete_callback,
        change_callback,
        slider_callback,
        color_callback,
        visibility_callback,
    ):

        super().__init__()

        self.number = number
        self.color = color
        self.visible = True

        self.slider_widget = None

        self.setStyleSheet(
            """
            QFrame {
                background: #ffffff;
                border-bottom: 1px solid #eeeeee;
            }
            """
        )

        self.layout = QVBoxLayout(self)

        self.layout.setContentsMargins(
            0,
            0,
            0,
            0,
        )

        self.layout.setSpacing(0)

        # ----------------------------------------------------
        # Main row
        # ----------------------------------------------------

        main = QFrame()

        main.setFixedHeight(56)

        main_layout = QHBoxLayout(main)

        main_layout.setContentsMargins(
            8,
            3,
            5,
            3,
        )

        main_layout.setSpacing(5)

        # ----------------------------------------------------
        # Colour
        # ----------------------------------------------------

        self.color_button = QPushButton()

        self.color_button.setFixedSize(
            8,
            42,
        )

        self.update_color_button()

        self.color_button.clicked.connect(
            lambda: color_callback(self)
        )

        main_layout.addWidget(
            self.color_button
        )

        # ----------------------------------------------------
        # Number
        # ----------------------------------------------------

        number_label = QLabel(
            str(number)
        )

        number_label.setFixedWidth(22)

        number_label.setAlignment(
            Qt.AlignmentFlag.AlignCenter
        )

        main_layout.addWidget(
            number_label
        )

        # ----------------------------------------------------
        # Visibility
        # ----------------------------------------------------

        self.visibility_button = QPushButton(
            "●"
        )

        self.visibility_button.setFixedSize(
            25,
            30,
        )

        self.update_visibility_button()

        self.visibility_button.clicked.connect(
            lambda: visibility_callback(self)
        )

        main_layout.addWidget(
            self.visibility_button
        )

        # ----------------------------------------------------
        # Expression
        # ----------------------------------------------------

        self.input = QLineEdit()

        self.input.setPlaceholderText(
            "y = ..."
        )

        self.input.setFont(
            QFont(
                "Arial",
                13,
            )
        )

        self.input.setStyleSheet(
            """
            QLineEdit {
                border: none;
                background: transparent;
                color: #222222;
                padding: 5px;
            }

            QLineEdit:focus {
                border-bottom: 1px solid #cccccc;
            }
            """
        )

        self.input.textChanged.connect(
            change_callback
        )

        main_layout.addWidget(
            self.input
        )

        # ----------------------------------------------------
        # Delete
        # ----------------------------------------------------

        delete = QPushButton(
            "×"
        )

        delete.setFixedSize(
            30,
            34,
        )

        delete.setStyleSheet(
            """
            QPushButton {
                background: transparent;
                border: none;
                color: #777777;
                font-size: 22px;
            }

            QPushButton:hover {
                background: #f2f2f2;
                color: #c74440;
                border-radius: 5px;
            }
            """
        )

        delete.clicked.connect(
            lambda: delete_callback(self)
        )

        main_layout.addWidget(
            delete
        )

        self.layout.addWidget(
            main
        )

    # ========================================================
    # COLOUR
    # ========================================================

    def update_color_button(self):

        self.color_button.setStyleSheet(
            f"""
            QPushButton {{
                background: {self.color};
                border: none;
                border-radius: 4px;
            }}

            QPushButton:hover {{
                border: 2px solid #333333;
            }}
            """
        )

    # ========================================================
    # VISIBILITY
    # ========================================================

    def update_visibility_button(self):

        if self.visible:

            self.visibility_button.setText(
                "●"
            )

            self.visibility_button.setStyleSheet(
                f"""
                QPushButton {{
                    background: transparent;
                    border: none;
                    color: {self.color};
                    font-size: 14px;
                }}

                QPushButton:hover {{
                    background: #eeeeee;
                    border-radius: 5px;
                }}
                """
            )

        else:

            self.visibility_button.setText(
                "○"
            )

            self.visibility_button.setStyleSheet(
                """
                QPushButton {
                    background: transparent;
                    border: none;
                    color: #aaaaaa;
                    font-size: 14px;
                }
                """
            )

    # ========================================================
    # CREATE SLIDER
    # ========================================================

    def set_slider(
        self,
        name,
        value,
        callback,
    ):

        if self.slider_widget:

            self.slider_widget.deleteLater()

        self.slider_widget = VariableSlider(
            name,
            value,
            self,
        )

        self.slider_widget.valueChanged.connect(
            callback
        )

        self.layout.addWidget(
            self.slider_widget
        )

    # ========================================================
    # REMOVE SLIDER
    # ========================================================

    def remove_slider(self):

        if self.slider_widget:

            self.slider_widget.deleteLater()

            self.slider_widget = None


# ============================================================
# GRAPH
# ============================================================

class GraphWidget(pg.PlotWidget):

    def __init__(
        self,
        range_callback,
        hover_callback,
    ):

        super().__init__()

        self.range_callback = range_callback
        self.hover_callback = hover_callback

        self.setBackground(
            "#ffffff"
        )

        self.showGrid(
            x=True,
            y=True,
            alpha=0.18,
        )

        self.setXRange(
            -10,
            10,
            padding=0,
        )

        self.setYRange(
            -10,
            10,
            padding=0,
        )

        self.setMouseEnabled(
            x=True,
            y=True,
        )

        self.getPlotItem().hideButtons()

        self.setLabel(
            "bottom",
            "x",
        )

        self.setLabel(
            "left",
            "y",
        )

        self.scene().sigMouseMoved.connect(
            self.mouse_moved
        )

        self.getPlotItem().vb.sigRangeChanged.connect(
            self.range_changed
        )

    # ========================================================
    # MOUSE
    # ========================================================

    def mouse_moved(
        self,
        position,
    ):

        if not self.sceneRect().contains(
            position
        ):

            self.hover_callback(
                None,
                None,
            )

            return

        point = self.getPlotItem().vb.mapSceneToView(
            position
        )

        self.hover_callback(
            point.x(),
            point.y(),
        )

    # ========================================================
    # RANGE
    # ========================================================

    def range_changed(
        self,
        *args,
    ):

        self.range_callback()

    # ========================================================
    # ZOOM
    # ========================================================

    def wheelEvent(
        self,
        event,
    ):

        delta = event.angleDelta().y()

        if delta == 0:
            return

        factor = (
            0.82
            if delta > 0
            else 1.22
        )

        vb = self.getPlotItem().vb

        point = vb.mapSceneToView(
            event.position()
        )

        mx = point.x()
        my = point.y()

        ranges = vb.viewRange()

        x0, x1 = ranges[0]
        y0, y1 = ranges[1]

        width = x1 - x0
        height = y1 - y0

        new_width = width * factor
        new_height = height * factor

        rx = (
            mx - x0
        ) / width

        ry = (
            my - y0
        ) / height

        self.setRange(
            xRange=(
                mx - new_width * rx,
                mx + new_width * (1 - rx),
            ),
            yRange=(
                my - new_height * ry,
                my + new_height * (1 - ry),
            ),
            padding=0,
        )


# ============================================================
# MAIN APPLICATION
# ============================================================

class DesmosPython(QMainWindow):

    def __init__(self):

        super().__init__()

        self.setWindowTitle(
            "Desmos Python"
        )

        self.resize(
            1450,
            900,
        )

        # ----------------------------------------------------
        # Data
        # ----------------------------------------------------

        self.rows = []

        self.next_number = 1

        self.variables = {}

        self.variable_values = {}

        self.points = {}

        # ----------------------------------------------------
        # Graph objects
        # ----------------------------------------------------

        self.curves = {}

        self.curve_data = {}

        self.vertical_lines = {}

        self.point_items = {}

        # ----------------------------------------------------
        # Compilation cache
        # ----------------------------------------------------

        self.compiled_cache = {}

        # ----------------------------------------------------
        # Debounce timer
        # ----------------------------------------------------

        self.redraw_timer = QTimer()

        self.redraw_timer.setSingleShot(
            True
        )

        self.redraw_timer.setInterval(
            300
        )

        self.redraw_timer.timeout.connect(
            self.redraw
        )

        # ----------------------------------------------------
        # Range timer
        # ----------------------------------------------------

        self.range_timer = QTimer()

        self.range_timer.setSingleShot(
            True
        )

        self.range_timer.setInterval(
            80
        )

        self.range_timer.timeout.connect(
            self.redraw
        )

        # ----------------------------------------------------
        # UI
        # ----------------------------------------------------

        self.create_ui()

        # Start with one expression
        self.add_expression()

    # ========================================================
    # UI
    # ========================================================

    def create_ui(self):

        central = QWidget()

        self.setCentralWidget(
            central
        )

        layout = QHBoxLayout(
            central
        )

        layout.setContentsMargins(
            0,
            0,
            0,
            0,
        )

        layout.setSpacing(0)

        # ====================================================
        # LEFT PANEL
        # ====================================================

        self.left_panel = QFrame()

        self.left_panel.setFixedWidth(
            400
        )

        self.left_panel.setStyleSheet(
            """
            QFrame {
                background: #ffffff;
                border-right: 1px solid #dddddd;
            }
            """
        )

        left_layout = QVBoxLayout(
            self.left_panel
        )

        left_layout.setContentsMargins(
            0,
            0,
            0,
            0,
        )

        left_layout.setSpacing(0)

        # ----------------------------------------------------
        # Header
        # ----------------------------------------------------

        header = QFrame()

        header.setFixedHeight(
            62
        )

        header_layout = QHBoxLayout(
            header
        )

        header_layout.setContentsMargins(
            15,
            0,
            15,
            0,
        )

        title = QLabel(
            "Graphing Calculator"
        )

        title.setFont(
            QFont(
                "Arial",
                16,
                QFont.Weight.Bold,
            )
        )

        header_layout.addWidget(
            title
        )

        left_layout.addWidget(
            header
        )

        # ----------------------------------------------------
        # Add expression
        # ----------------------------------------------------

        add_expression = QPushButton(
            "+  Add Expression"
        )

        add_expression.setFixedHeight(
            42
        )

        add_expression.setStyleSheet(
            """
            QPushButton {
                background: #f1f3f4;
                border: none;
                border-radius: 7px;
                margin: 4px 10px;
                padding-left: 12px;
                text-align: left;
                color: #333333;
                font-size: 13px;
            }

            QPushButton:hover {
                background: #e4e6e8;
            }
            """
        )

        add_expression.clicked.connect(
            self.add_expression
        )

        left_layout.addWidget(
            add_expression
        )

        # ----------------------------------------------------
        # Add point
        # ----------------------------------------------------

        add_point = QPushButton(
            "+  Add Point"
        )

        add_point.setFixedHeight(
            38
        )

        add_point.setStyleSheet(
            """
            QPushButton {
                background: transparent;
                border: none;
                margin: 0 10px 4px 10px;
                padding-left: 12px;
                text-align: left;
                color: #555555;
                font-size: 13px;
            }

            QPushButton:hover {
                background: #f1f3f4;
                border-radius: 6px;
            }
            """
        )

        add_point.clicked.connect(
            self.add_point
        )

        left_layout.addWidget(
            add_point
        )

        # ----------------------------------------------------
        # Scroll
        # ----------------------------------------------------

        self.scroll = QScrollArea()

        self.scroll.setWidgetResizable(
            True
        )

        self.scroll.setFrameShape(
            QFrame.Shape.NoFrame
        )

        self.scroll.setHorizontalScrollBarPolicy(
            Qt.ScrollBarPolicy.ScrollBarAlwaysOff
        )

        self.expression_container = QWidget()

        self.expression_layout = QVBoxLayout(
            self.expression_container
        )

        self.expression_layout.setContentsMargins(
            0,
            5,
            0,
            5,
        )

        self.expression_layout.setSpacing(0)

        self.expression_layout.addStretch()

        self.scroll.setWidget(
            self.expression_container
        )

        left_layout.addWidget(
            self.scroll
        )

        # ----------------------------------------------------
        # Bottom
        # ----------------------------------------------------

        bottom = QFrame()

        bottom.setFixedHeight(
            58
        )

        bottom_layout = QHBoxLayout(
            bottom
        )

        reset = QPushButton(
            "Reset View"
        )

        reset.clicked.connect(
            self.reset_view
        )

        bottom_layout.addWidget(
            reset
        )

        bottom_layout.addStretch()

        left_layout.addWidget(
            bottom
        )

        # ====================================================
        # GRAPH
        # ====================================================

        self.graph = GraphWidget(
            self.schedule_range_redraw,
            self.handle_hover,
        )

        layout.addWidget(
            self.left_panel
        )

        layout.addWidget(
            self.graph
        )

        # ====================================================
        # HOVER POINT
        # ====================================================

        self.hover_dot = pg.ScatterPlotItem(
            size=11,
            brush=pg.mkBrush(
                "#ffffff"
            ),
            pen=pg.mkPen(
                "#222222",
                width=2,
            ),
        )

        self.hover_dot.hide()

        self.graph.addItem(
            self.hover_dot
        )

        # ====================================================
        # HOVER VERTICAL
        # ====================================================

        self.hover_line = pg.InfiniteLine(
            angle=90,
            movable=False,
            pen=pg.mkPen(
                "#999999",
                width=1,
                style=Qt.PenStyle.DashLine,
            ),
        )

        self.hover_line.hide()

        self.graph.addItem(
            self.hover_line
        )

        # ====================================================
        # HOVER LABEL
        # ====================================================

        self.hover_label = pg.TextItem(
            "",
            color="#222222",
            anchor=(0, 1),
        )

        self.hover_label.setZValue(
            100
        )

        self.hover_label.hide()

        self.graph.addItem(
            self.hover_label
        )

    # ========================================================
    # ADD EXPRESSION
    # ========================================================

    def add_expression(self):

        number = self.next_number

        self.next_number += 1

        color = COLORS[
            (number - 1)
            % len(COLORS)
        ]

        row = ExpressionRow(
            number,
            color,
            self.delete_expression,
            self.expression_changed,
            self.slider_changed,
            self.choose_color,
            self.toggle_visibility,
        )

        self.rows.append(
            row
        )

        self.expression_layout.insertWidget(
            self.expression_layout.count() - 1,
            row,
        )

        row.input.setFocus()

    # ========================================================
    # ADD POINT
    # ========================================================

    def add_point(self):

        number = self.next_number

        self.next_number += 1

        color = COLORS[
            (number - 1)
            % len(COLORS)
        ]

        row = ExpressionRow(
            number,
            color,
            self.delete_expression,
            self.expression_changed,
            self.slider_changed,
            self.choose_color,
            self.toggle_visibility,
        )

        row.input.setPlaceholderText(
            "A = (x, y)"
        )

        self.rows.append(
            row
        )

        self.expression_layout.insertWidget(
            self.expression_layout.count() - 1,
            row,
        )

        row.input.setFocus()

    # ========================================================
    # EXPRESSION EDITED
    # ========================================================

    def expression_changed(
        self,
        *args,
    ):

        # Do not calculate for every keystroke.
        #
        # Every keystroke restarts the timer.
        #
        # Calculation happens only after the user pauses.

        self.redraw_timer.start()

    # ========================================================
    # DELETE
    # ========================================================

    def delete_expression(
        self,
        row,
    ):

        self.clear_row_graphics(
            row
        )

        if row in self.rows:

            self.rows.remove(
                row
            )

        row.deleteLater()

        self.redraw_timer.start(
            30
        )

    # ========================================================
    # CLEAR GRAPHICS FOR ONE ROW
    # ========================================================

    def clear_row_graphics(
        self,
        row,
    ):

        # ----------------------------------------------------
        # Curves
        # ----------------------------------------------------

        curves = self.curves.pop(
            row,
            [],
        )

        for curve in curves:

            try:

                self.graph.removeItem(
                    curve
                )

            except Exception:

                pass

        # ----------------------------------------------------
        # Curve data
        # ----------------------------------------------------

        keys = [
            key
            for key in self.curve_data
            if key[0] is row
        ]

        for key in keys:

            del self.curve_data[
                key
            ]

        # ----------------------------------------------------
        # Vertical line
        # ----------------------------------------------------

        if row in self.vertical_lines:

            try:

                self.graph.removeItem(
                    self.vertical_lines[row]
                )

            except Exception:

                pass

            del self.vertical_lines[
                row
            ]

        # ----------------------------------------------------
        # Point
        # ----------------------------------------------------

        if row in self.point_items:

            dot, label = self.point_items.pop(
                row
            )

            try:

                self.graph.removeItem(
                    dot
                )

            except Exception:

                pass

            try:

                self.graph.removeItem(
                    label
                )

            except Exception:

                pass

    # ========================================================
    # COLOUR
    # ========================================================

    def choose_color(
        self,
        row,
    ):

        color = QColorDialog.getColor(
            QColor(row.color),
            self,
            "Choose Curve Colour",
        )

        if not color.isValid():
            return

        row.color = color.name()

        row.update_color_button()

        row.update_visibility_button()

        for curve in self.curves.get(
            row,
            [],
        ):

            curve.setPen(
                pg.mkPen(
                    row.color,
                    width=2.5,
                )
            )

        if row in self.point_items:

            dot, label = self.point_items[
                row
            ]

            dot.setBrush(
                pg.mkBrush(
                    row.color
                )
            )

            label.setColor(
                row.color
            )

        if row in self.vertical_lines:

            self.vertical_lines[
                row
            ].setPen(
                pg.mkPen(
                    row.color,
                    width=2.5,
                )
            )

    # ========================================================
    # VISIBILITY
    # ========================================================

    def toggle_visibility(
        self,
        row,
    ):

        row.visible = not row.visible

        row.update_visibility_button()

        if not row.visible:

            self.clear_row_graphics(
                row
            )

        else:

            self.redraw_timer.start(
                20
            )

    # ========================================================
    # SLIDER CHANGED
    # ========================================================

    def slider_changed(
        self,
        name,
        value,
    ):

        # ----------------------------------------------------
        # Update actual value
        # ----------------------------------------------------

        self.variable_values[
            name
        ] = value

        # ----------------------------------------------------
        # Find the variable definition.
        #
        # Example:
        #
        # a=1
        #
        # becomes:
        #
        # a=2.09
        # ----------------------------------------------------

        for row in self.rows:

            text = row.input.text().strip()

            if "=" not in text:
                continue

            left, right = text.split(
                "=",
                1,
            )

            if left.strip() != name:
                continue

            # Only rewrite simple variable definitions.
            #
            # If somebody has:
            #
            # b = a + 1
            #
            # dragging b should NOT destroy its formula.
            #
            # Such expressions don't get sliders anyway.

            formatted = self.format_number(
                value
            )

            new_text = (
                f"{name}={formatted}"
            )

            # IMPORTANT:
            #
            # Don't emit textChanged while the slider is
            # changing the expression.
            row.input.blockSignals(
                True
            )

            row.input.setText(
                new_text
            )

            row.input.blockSignals(
                False
            )

            # Keep slider's own number display synchronized.
            if row.slider_widget:

                row.slider_widget.set_value(
                    value
                )

            break

        # ----------------------------------------------------
        # Recompile
        # ----------------------------------------------------

        self.compiled_cache.clear()

        # ----------------------------------------------------
        # Fast redraw
        # ----------------------------------------------------

        self.redraw_timer.start(
            15
        )

    # ========================================================
    # RANGE
    # ========================================================

    def schedule_range_redraw(self):

        self.range_timer.start()

    # ========================================================
    # SCAN VARIABLES
    # ========================================================

    def scan_variables(self):

        definitions = {}

        # ----------------------------------------------------
        # Find definitions
        # ----------------------------------------------------

        for row in self.rows:

            text = row.input.text().strip()

            if "=" not in text:
                continue

            if self.is_point_definition(
                text
            ):
                continue

            left, right = text.split(
                "=",
                1,
            )

            left = left.strip()
            right = right.strip()

            if re.fullmatch(
                r"[A-Za-z_][A-Za-z0-9_]*",
                left,
            ):

                if left not in (
                    "x",
                    "y",
                ):

                    definitions[
                        left
                    ] = right

        # ----------------------------------------------------
        # Resolve variable expressions
        # ----------------------------------------------------

        resolved = {}

        for _ in range(
            len(definitions) + 5
        ):

            changed = False

            for name, text in definitions.items():

                expression = Parser.parse(
                    text,
                    resolved,
                )

                if expression is None:
                    continue

                unknown = (
                    expression.free_symbols
                    -
                    {
                        X,
                        Y,
                    }
                    -
                    set(
                        resolved.keys()
                    )
                )

                if unknown:
                    continue

                resolved[
                    name
                ] = expression

                changed = True

            if not changed:
                break

        self.variables = resolved

        # ----------------------------------------------------
        # Update current variable values
        # ----------------------------------------------------

        #
        # Since sliders rewrite:
        #
        # a=1
        #
        # into:
        #
        # a=2.09
        #
        # we can safely evaluate the definition each time.
        #

        for name, expression in resolved.items():

            try:

                # Only numeric expressions should become
                # slider-controlled values.
                #
                # Example:
                #
                # a = 2
                #
                # is numeric.
                #
                # b = a + 1
                #
                # is dependent and doesn't get its own slider.

                free = expression.free_symbols

                free -= {
                    X,
                    Y,
                }

                if not free:

                    value = float(
                        expression.evalf()
                    )

                    self.variable_values[
                        name
                    ] = value

            except Exception:

                pass

        # ----------------------------------------------------
        # Sliders
        # ----------------------------------------------------

        for row in self.rows:

            text = row.input.text().strip()

            if "=" not in text:
                continue

            if self.is_point_definition(
                text
            ):
                continue

            left, right = text.split(
                "=",
                1,
            )

            name = left.strip()
            right = right.strip()

            if name not in resolved:
                row.remove_slider()
                continue

            expression = resolved[
                name
            ]

            # ------------------------------------------------
            # Only create sliders for numeric variables.
            #
            # a=1       -> slider
            # b=2.5     -> slider
            #
            # b=a+1     -> no slider
            # ------------------------------------------------

            try:

                if expression.free_symbols:

                    row.remove_slider()

                    continue

                value = self.variable_values.get(
                    name,
                    float(
                        expression.evalf()
                    ),
                )

                if row.slider_widget is None:

                    row.set_slider(
                        name,
                        value,
                        self.slider_changed,
                    )

                else:

                    # Update slider without firing
                    # its signal.
                    row.slider_widget.set_value(
                        value
                    )

            except Exception:

                row.remove_slider()

    # ========================================================
    # SCAN POINTS
    # ========================================================

    def scan_points(self):

        new_points = {}

        for row in self.rows:

            text = row.input.text().strip()

            match = re.match(
                r"^([A-Za-z][A-Za-z0-9_]*)"
                r"\s*=\s*"
                r"\(\s*(.*?)\s*,\s*(.*?)\s*\)$",
                text,
            )

            if not match:
                continue

            name = match.group(1)

            x_text = match.group(2)
            y_text = match.group(3)

            try:

                x_expr = Parser.parse(
                    x_text,
                    self.variables,
                )

                y_expr = Parser.parse(
                    y_text,
                    self.variables,
                )

                if (
                    x_expr is None
                    or
                    y_expr is None
                ):

                    continue

                x_value = float(
                    x_expr.evalf(
                        subs=self.variable_values
                    )
                )

                y_value = float(
                    y_expr.evalf(
                        subs=self.variable_values
                    )
                )

                if not (
                    math.isfinite(
                        x_value
                    )
                    and
                    math.isfinite(
                        y_value
                    )
                ):

                    continue

                new_points[
                    name
                ] = GraphPoint(
                    name,
                    x_value,
                    y_value,
                )

            except Exception:

                continue

        self.points = new_points

    # ========================================================
    # REDRAW
    # ========================================================

    def redraw(self):

        # ----------------------------------------------------
        # Remove all old graph objects first.
        #
        # This prevents old calculations from remaining.
        # ----------------------------------------------------

        for row in list(
            self.rows
        ):

            self.clear_row_graphics(
                row
            )

        # ----------------------------------------------------
        # Rebuild variable state
        # ----------------------------------------------------

        self.scan_variables()

        self.scan_points()

        # ----------------------------------------------------
        # Plot everything again
        # ----------------------------------------------------

        for row in self.rows:

            if not row.visible:
                continue

            text = row.input.text().strip()

            if not text:
                continue

            # ------------------------------------------------
            # Variable
            # ------------------------------------------------

            if self.is_variable_definition(
                text
            ):

                continue

            # ------------------------------------------------
            # Point
            # ------------------------------------------------

            if self.is_point_definition(
                text
            ):

                self.draw_point(
                    row
                )

                continue

            # ------------------------------------------------
            # Function / equation
            # ------------------------------------------------

            self.plot_expression(
                row,
                text
            )

    # ========================================================
    # VARIABLE DEFINITION?
    # ========================================================

    def is_variable_definition(
        self,
        text,
    ):

        if "=" not in text:
            return False

        if self.is_point_definition(
            text
        ):
            return False

        left, right = text.split(
            "=",
            1,
        )

        left = left.strip()

        return (
            bool(
                re.fullmatch(
                    r"[A-Za-z_][A-Za-z0-9_]*",
                    left,
                )
            )
            and
            left not in (
                "x",
                "y",
            )
        )

    # ========================================================
    # POINT?
    # ========================================================

    def is_point_definition(
        self,
        text,
    ):

        return bool(
            re.match(
                r"^[A-Za-z][A-Za-z0-9_]*"
                r"\s*=\s*\(",
                text,
            )
        )

    # ========================================================
    # PLOT EXPRESSION
    # ========================================================

    def plot_expression(
        self,
        row,
        text,
    ):

        # ----------------------------------------------------
        # Vertical line
        # ----------------------------------------------------

        if re.match(
            r"^\s*x\s*=",
            text,
            re.IGNORECASE,
        ):

            equation = self.parse_equation(
                text
            )

            if equation is not None:

                self.plot_vertical(
                    row,
                    equation
                )

            return

        # ----------------------------------------------------
        # y equation
        # ----------------------------------------------------

        if re.match(
            r"^\s*y\s*=",
            text,
            re.IGNORECASE,
        ):

            equation = self.parse_equation(
                text
            )

            if equation is not None:

                self.plot_y_equation(
                    row,
                    equation
                )

            return

        # ----------------------------------------------------
        # General function
        # ----------------------------------------------------

        expression = Parser.parse(
            text,
            self.variables,
        )

        if expression is None:
            return

        expression = expression.subs(
            self.variables
        )

        if Y in expression.free_symbols:

            self.plot_y_equation(
                row,
                expression,
            )

        else:

            self.plot_function(
                row,
                expression,
            )

    # ========================================================
    # EQUATION
    # ========================================================

    def parse_equation(
        self,
        text,
    ):

        if "=" not in text:
            return None

        left, right = text.split(
            "=",
            1,
        )

        lhs = Parser.parse(
            left,
            self.variables,
        )

        rhs = Parser.parse(
            right,
            self.variables,
        )

        if (
            lhs is None
            or
            rhs is None
        ):

            return None

        equation = (
            lhs - rhs
        )

        equation = equation.subs(
            self.variables
        )

        return equation

    # ========================================================
    # RANGE
    # ========================================================

    def get_range(self):

        ranges = self.graph.viewRange()

        return (
            ranges[0][0],
            ranges[0][1],
            ranges[1][0],
            ranges[1][1],
        )

    # ========================================================
    # SAMPLE COUNT
    # ========================================================

    def sample_count(self):

        width = max(
            self.graph.width(),
            500,
        )

        return int(
            np.clip(
                width * 1.25,
                800,
                2400,
            )
        )

    # ========================================================
    # PLOT Y EQUATION
    # ========================================================

    def plot_y_equation(
        self,
        row,
        equation,
    ):

        try:

            solutions = sp.solve(
                equation,
                Y,
            )

        except Exception:

            return

        if not solutions:
            return

        x_min, x_max, _, _ = (
            self.get_range()
        )

        x_values = np.linspace(
            x_min,
            x_max,
            self.sample_count(),
        )

        variable_names = list(
            self.variable_values.keys()
        )

        variable_symbols = [
            sp.Symbol(
                name,
                real=True,
            )
            for name in variable_names
        ]

        for index, solution in enumerate(
            solutions
        ):

            try:

                solution = solution.subs(
                    self.variables
                )

                cache_key = (
                    "y",
                    sp.srepr(solution),
                    tuple(
                        variable_names
                    ),
                )

                function = self.compiled_cache.get(
                    cache_key
                )

                if function is None:

                    function = sp.lambdify(
                        (
                            X,
                            *variable_symbols,
                        ),
                        solution,
                        modules="numpy",
                    )

                    self.compiled_cache[
                        cache_key
                    ] = function

                args = [
                    self.variable_values[
                        name
                    ]
                    for name in variable_names
                ]

                with np.errstate(
                    all="ignore"
                ):

                    values = function(
                        x_values,
                        *args,
                    )

                values = np.asarray(
                    values,
                    dtype=float,
                )

                if values.ndim == 0:

                    values = np.full(
                        x_values.shape,
                        values,
                    )

                values = self.clean_values(
                    values
                )

                curve = self.graph.plot(
                    x_values,
                    values,
                    pen=pg.mkPen(
                        row.color,
                        width=2.5,
                    ),
                    connect="finite",
                )

                curve.setZValue(
                    10
                )

                self.curves.setdefault(
                    row,
                    []
                ).append(
                    curve
                )

                self.curve_data[
                    (row, index)
                ] = (
                    x_values,
                    values,
                )

            except Exception:

                continue

    # ========================================================
    # NORMAL FUNCTION
    # ========================================================

    def plot_function(
        self,
        row,
        expression,
    ):

        try:

            x_min, x_max, _, _ = (
                self.get_range()
            )

            x_values = np.linspace(
                x_min,
                x_max,
                self.sample_count(),
            )

            variable_names = list(
                self.variable_values.keys()
            )

            variable_symbols = [
                sp.Symbol(
                    name,
                    real=True,
                )
                for name in variable_names
            ]

            expression = expression.subs(
                self.variables
            )

            cache_key = (
                "function",
                sp.srepr(expression),
                tuple(
                    variable_names
                ),
            )

            function = self.compiled_cache.get(
                cache_key
            )

            if function is None:

                function = sp.lambdify(
                    (
                        X,
                        *variable_symbols,
                    ),
                    expression,
                    modules="numpy",
                )

                self.compiled_cache[
                    cache_key
                ] = function

            args = [
                self.variable_values[
                    name
                ]
                for name in variable_names
            ]

            with np.errstate(
                all="ignore"
            ):

                values = function(
                    x_values,
                    *args,
                )

            values = np.asarray(
                values,
                dtype=float,
            )

            if values.ndim == 0:

                values = np.full(
                    x_values.shape,
                    values,
                )

            values = self.clean_values(
                values
            )

            curve = self.graph.plot(
                x_values,
                values,
                pen=pg.mkPen(
                    row.color,
                    width=2.5,
                ),
                connect="finite",
            )

            curve.setZValue(
                10
            )

            self.curves.setdefault(
                row,
                []
            ).append(
                curve
            )

            self.curve_data[
                (row, 0)
            ] = (
                x_values,
                values,
            )

        except Exception:

            return

    # ========================================================
    # VERTICAL LINE
    # ========================================================

    def plot_vertical(
        self,
        row,
        equation,
    ):

        try:

            solutions = sp.solve(
                equation,
                X,
            )

            if not solutions:
                return

            value = float(
                sp.N(
                    solutions[0]
                )
            )

            line = pg.InfiniteLine(
                pos=value,
                angle=90,
                movable=False,
                pen=pg.mkPen(
                    row.color,
                    width=2.5,
                ),
            )

            line.setZValue(
                10
            )

            self.graph.addItem(
                line
            )

            self.vertical_lines[
                row
            ] = line

        except Exception:

            return

    # ========================================================
    # CLEAN VALUES
    # ========================================================

    def clean_values(
        self,
        values,
    ):

        values = values.copy()

        values[
            ~np.isfinite(values)
        ] = np.nan

        _, _, y_min, y_max = (
            self.get_range()
        )

        height = max(
            abs(
                y_max - y_min
            ),
            1,
        )

        limit = max(
            height * 500,
            1e5,
        )

        values[
            np.abs(values) > limit
        ] = np.nan

        return values

    # ========================================================
    # DRAW POINT
    # ========================================================

    def draw_point(
        self,
        row,
    ):

        text = row.input.text().strip()

        match = re.match(
            r"^([A-Za-z][A-Za-z0-9_]*)"
            r"\s*=\s*"
            r"\(\s*(.*?)\s*,\s*(.*?)\s*\)$",
            text,
        )

        if not match:
            return

        name = match.group(1)

        if name not in self.points:
            return

        point = self.points[
            name
        ]

        dot = pg.ScatterPlotItem(
            [point.x],
            [point.y],
            size=11,
            brush=pg.mkBrush(
                row.color
            ),
            pen=pg.mkPen(
                "#ffffff",
                width=2,
            ),
        )

        label = pg.TextItem(
            f"{name} "
            f"("
            f"{self.format_number(point.x)}, "
            f"{self.format_number(point.y)}"
            f")",
            color=row.color,
            anchor=(0, 1),
        )

        label.setPos(
            point.x,
            point.y,
        )

        label.setZValue(
            50
        )

        self.graph.addItem(
            dot
        )

        self.graph.addItem(
            label
        )

        self.point_items[
            row
        ] = (
            dot,
            label,
        )

    # ========================================================
    # HOVER / CURVE TRACKING
    # ========================================================

    def handle_hover(
        self,
        mouse_x,
        mouse_y=None,
    ):

        if mouse_x is None:

            self.hover_dot.hide()
            self.hover_line.hide()
            self.hover_label.hide()

            return

        best = None

        ranges = self.graph.viewRange()

        x_range = max(
            ranges[0][1] -
            ranges[0][0],
            1e-9,
        )

        y_range = max(
            ranges[1][1] -
            ranges[1][0],
            1e-9,
        )

        for (
            row,
            index,
        ), (
            x_values,
            y_values,
        ) in self.curve_data.items():

            if not row.visible:
                continue

            if len(x_values) == 0:
                continue

            position = np.searchsorted(
                x_values,
                mouse_x,
            )

            candidates = []

            if position > 0:

                candidates.append(
                    position - 1
                )

            if position < len(
                x_values
            ):

                candidates.append(
                    position
                )

            for i in candidates:

                y = y_values[i]

                if not np.isfinite(y):
                    continue

                px = x_values[i]

                dx = (
                    px - mouse_x
                ) / x_range

                dy = (
                    y - mouse_y
                ) / y_range

                distance = (
                    dx * dx
                    +
                    dy * dy
                )

                if (
                    best is None
                    or
                    distance < best[0]
                ):

                    best = (
                        distance,
                        px,
                        y,
                        row,
                    )

        if best is None:

            self.hover_dot.hide()
            self.hover_line.hide()
            self.hover_label.hide()

            return

        distance, px, py, row = best

        pixel_distance = (
            math.sqrt(distance)
            *
            self.graph.width()
        )

        if pixel_distance > 30:

            self.hover_dot.hide()
            self.hover_line.hide()
            self.hover_label.hide()

            return

        self.hover_dot.setData(
            [px],
            [py],
            brush=pg.mkBrush(
                row.color
            ),
        )

        self.hover_dot.show()

        self.hover_line.setValue(
            px
        )

        self.hover_line.show()

        self.hover_label.setText(
            f"("
            f"{self.format_number(px)}, "
            f"{self.format_number(py)}"
            f")"
        )

        self.hover_label.setColor(
            row.color
        )

        self.hover_label.setPos(
            px,
            py,
        )

        self.hover_label.show()

    # ========================================================
    # FORMAT NUMBER
    # ========================================================

    @staticmethod
    def format_number(
        value,
    ):

        if abs(value) < 1e-10:

            value = 0

        if abs(value) >= 10000:

            return f"{value:.3g}"

        if (
            abs(value) < 0.001
            and
            value != 0
        ):

            return f"{value:.3g}"

        return f"{value:.4g}"

    # ========================================================
    # RESET
    # ========================================================

    def reset_view(self):

        self.graph.setXRange(
            -10,
            10,
            padding=0,
        )

        self.graph.setYRange(
            -10,
            10,
            padding=0,
        )

        self.redraw_timer.start(
            20
        )


# ============================================================
# MAIN
# ============================================================

def main():

    app = QApplication(
        sys.argv
    )

    app.setApplicationName(
        "Desmos Python"
    )

    app.setStyle(
        "Fusion"
    )

    window = DesmosPython()

    window.show()

    sys.exit(
        app.exec()
    )


# ============================================================
# RUN
# ============================================================

if __name__ == "__main__":

    main()
