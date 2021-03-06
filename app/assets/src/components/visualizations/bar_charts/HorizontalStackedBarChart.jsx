import React from "react";
import PropTypes from "~/components/utils/propTypes";
import { maxBy } from "lodash";
import { scaleLinear, scaleBand, scaleOrdinal } from "d3-scale";
import { stack } from "d3-shape";
import { max } from "d3-array";
import cx from "classnames";

import XAxis from "./XAxis";
import YAxis from "./YAxis";
import cs from "./horizontal_stacked_bar_chart.scss";

// Data passed into this chart should be an array of objects in the form:
// [
//  ...
//  { yAxisKey: yValue1, dataKey1: value1, dataKey2: value2, total: value1 + value2 },
//  { yAxisKey: yValue2, dataKey1: value2, dataKey2: value3, total: value3 + value4 },
//  ...
// ]
// an example object:
// { item: "Donuts", MondaySales: 10, TuesdaySales: 7, total: 17 }

// We don't want labels on the Y-axis to take up any more than 30% of the width of the chart.
const MAX_Y_AXIS_AREA_RATIO = 0.3;

// This object shows all the settings you can pass into the options object.
// These are used as defaults.
const defaults = {
  canvasClassName: null,
  colors: [
    "#AABDFC",
    "#DF87B0",
    "#88D0CA",
    "#2C8CB5",
    "#E58740",
    "#D43A81",
    "#55C567",
    "#1E968B",
    "#693BAC",
  ],
  sort: null,
  x: {
    pathVisible: true,
    ticksVisible: true,
    gridVisible: true,
    tickSize: 6,
    tickSpacing: 45,
    axisTitle: null,
    axisTitleClassName: null,
    gridClassName: null,
    textClassName: null,
  },
  y: {
    pathVisible: true,
    ticksVisible: true,
    tickSize: 6,
    textClassName: null,
  },
  bars: {
    height: 22,
    padding: 6,
    strokeWidth: 2,
    stackPieceClassName: null,
    fullBarClassName: null,
    emptySpaceClassName: null,
  },
};

export default class HorizontalStackedBarChart extends React.Component {
  constructor(props) {
    super(props);

    const { data, keys, width, options, yAxisKey } = props;

    const mergedOptions = this.mergeOptionsWithDefaults(defaults, options);

    const stateData = data;

    if (mergedOptions.sort) {
      stateData.sort(mergedOptions.sort);
    }

    const dataKeys = keys.filter(key => key !== yAxisKey);
    const stackGenerator = stack().keys(dataKeys);
    const stackedData = stackGenerator(stateData);

    this.state = {
      data: stateData,
      options: mergedOptions,
      stackedData,
      keys,
      dataKeys,
      mouseOverBar: null,
      measurementsTaken: false,
    };

    this.references = { x: null, y: [], w: null, ellipsis: null };
  }

  componentDidMount() {
    const { width, yAxisKey } = this.props;
    const { data, dataKeys, options } = this.state;

    const { xTextHeight, xTextWidth } = this.measureXAxisText();
    const yTextWidthPairs = this.measureYAxisText();
    const [wideGlyphTextWidth, ellipsisTextWidth] = ["w", "ellipsis"].map(
      ref => this.references[ref].clientWidth
    );

    const { barCanvasHeight, xAxisHeight } = this.measureHeights(xTextHeight);
    let { barCanvasWidth, yAxisWidth, truncatedLabels } = this.measureWidths(
      xTextWidth,
      yTextWidthPairs,
      wideGlyphTextWidth,
      ellipsisTextWidth
    );

    const { x, y, z } = this.createDimensions(barCanvasWidth, barCanvasHeight);

    y.domain(
      data.map(d => {
        return d[yAxisKey];
      })
    );

    x.domain([
      0,
      max(data, d => {
        return d.total;
      }),
    ]).nice();

    z.domain(dataKeys);

    const labels = truncatedLabels.length > 0 ? truncatedLabels : y.domain();

    this.setState({
      xAxisHeight,
      barCanvasHeight,
      barCanvasWidth,
      yAxisWidth,
      labels,
      barHeight: y.bandwidth(),
      x,
      y,
      z,
      measurementsTaken: true,
    });
  }

  /* --- pre-mount functions --- */

  mergeOptionsWithDefaults(defaults, options) {
    const mergedOptions = {};
    const valueOptionKeys = ["canvasClassName", "colors", "sort"];
    valueOptionKeys.forEach(option => {
      mergedOptions[option] = options[option] || defaults[option];
    });

    const referenceOptionKeys = ["x", "y", "bars", "margin"];
    referenceOptionKeys.forEach(option => {
      mergedOptions[option] = {
        ...defaults[option],
        ...options[option],
      };
    });
    return mergedOptions;
  }

  /* --- post-mount functions --- */

  measureHeights(xTextHeight) {
    const { data, options } = this.state;

    const xAxisHeight =
      options.x.tickSize * (options.x.ticksVisible || options.x.pathVisible) +
      xTextHeight;
    const barCanvasHeight =
      data.length * (options.bars.height + options.bars.padding);

    return { barCanvasHeight, xAxisHeight };
  }

  measureWidths(
    xTextWidth,
    yTextWidthPairs,
    wideGlyphTextWidth,
    ellipsisTextWidth
  ) {
    const { width } = this.props;
    const { options } = this.state;

    let truncatedLabels = [];
    const longestLabel = maxBy(yTextWidthPairs, pair => pair[1]);
    const longestLabelLength = longestLabel[1];

    // Since x-axis labels are centered on their tick mark, we need to make sure
    // the last tick mark appears before the right end of the canvas with enough
    // space for the label
    const canvasWidth = width - xTextWidth;
    let yAxisWidth = Math.min(
      longestLabelLength,
      canvasWidth * MAX_Y_AXIS_AREA_RATIO
    );

    if (longestLabelLength > yAxisWidth) {
      const truncatedLabelWidth = yAxisWidth - ellipsisTextWidth;

      yTextWidthPairs.forEach(pair => {
        const [label, labelWidth] = pair;

        let modifiedLabel = label;

        if (labelWidth > yAxisWidth) {
          const lengthToTruncate = Math.ceil(
            (labelWidth - (yAxisWidth + ellipsisTextWidth)) / wideGlyphTextWidth
          );
          const truncatedLabelSliceIndex = label.length - lengthToTruncate - 1;
          modifiedLabel = label.slice(0, truncatedLabelSliceIndex) + "...";
        }

        truncatedLabels.push(modifiedLabel);
      });
    }

    const barCanvasWidth = canvasWidth - yAxisWidth;
    // properly translate the canvas to the right
    yAxisWidth = yAxisWidth + xTextWidth / 2;

    return { barCanvasWidth, yAxisWidth, truncatedLabels };
  }

  createDimensions(barCanvasWidth, barCanvasHeight, xTextWidth) {
    const { options } = this.state;

    const paddingScalar = options.bars.padding / options.bars.height;

    const x = scaleLinear().range([0, barCanvasWidth]);
    const y = scaleBand()
      .range([0, barCanvasHeight])
      .paddingInner(paddingScalar)
      .paddingOuter(paddingScalar / 4);
    const z = scaleOrdinal().range(options.colors);

    return { x, y, z };
  }

  /* --- measure baseline text dimensions from client rendering --- */

  renderAxisBaselines() {
    const { yAxisKey } = this.props;
    const { data, options } = this.state;

    const elements = data.map(datum => {
      const yAttribute = datum[yAxisKey];
      return (
        <div
          className={cx(cs.test, options.y.textClassName, cs.yAxisText)}
          key={yAttribute}
          ref={ref => {
            this.references.y.push([yAttribute, ref]);
          }}
        >
          {yAttribute}
        </div>
      );
    });

    // measure how wide the glyph "W" is, since this is
    // almost always the widest glyph, and also
    // measure how wide an ellipsis is, because we need to
    // truncate text shorter than the width of the y-axis
    // area to add ellipses at the end.
    elements.push(
      <div
        className={cx(cs.test, options.y.textClassName, cs.yAxisText)}
        key={"W"}
        ref={ref => {
          this.references.w = ref;
        }}
      >
        {"W"}
      </div>,
      <div
        className={cx(cs.test, options.x.textClassName, cs.xAxisText)}
        key={"x-axis-text"}
        ref={ref => {
          this.references.x = ref;
        }}
      >
        {"999M" /* for the x-axis */}
      </div>,
      <div
        className={cx(cs.test, options.y.textClassName, cs.yAxisText)}
        key={"ellipsis"}
        ref={ref => {
          this.references.ellipsis = ref;
        }}
      >
        {"..."}
      </div>
    );

    return elements;
  }

  measureXAxisText() {
    return {
      xTextHeight: this.references.x.clientHeight,
      xTextWidth: this.references.x.clientWidth,
    };
  }

  measureYAxisText() {
    return this.references.y.map(keyRefPair => [
      keyRefPair[0],
      keyRefPair[1].clientWidth,
    ]);
  }

  /* --- callbacks --- */

  handleYAxisLabelClick = (yAttribute, index) => {
    const { events } = this.props;
    const { data } = this.state;

    events.onYAxisLabelClick(yAttribute, data[index]);
  };

  /* --- rendering --- */

  renderVisibleStackedBars() {
    const { events, yAxisKey } = this.props;
    const {
      options,
      data,
      dataKeys,
      stackedData,
      barHeight,
      mouseOverBar,
      x,
      y,
      z,
    } = this.state;

    const coloredBars = dataKeys.map((key, keyIndex) => {
      const color = z(key);
      const colorStackComponent = stackedData[keyIndex].map(
        (stackPieceRange, stackIndex) => {
          const yAttribute = data[stackIndex][yAxisKey];
          const xLeft = stackPieceRange[0];
          const xRight = stackPieceRange[1];
          const yPosition = y(yAttribute);
          const xPosition = x(xLeft);
          let width = x(xRight - xLeft) - options.bars.strokeWidth;

          // keep bars at least 1 pixel wide so they're visible
          if (width < 1) {
            width = 1;
          }

          const valueForStackPiece = data[stackIndex][key];

          return (
            <g key={`${yAttribute}+${key}`}>
              <rect
                y={yPosition}
                x={xPosition}
                width={width}
                height={barHeight}
                key={`${yAttribute}+${keyIndex}`}
                className={cx(options.bars.stackPieceClassName, cs.barPiece)}
                onMouseOver={() =>
                  events.onBarStackHover(yAttribute, key, valueForStackPiece)
                }
              />
            </g>
          );
        }
      );
      return (
        <g
          fill={color}
          stroke={color}
          strokeWidth={options.bars.strokeWidth}
          key={`${color}+${keyIndex}`}
        >
          {colorStackComponent}
        </g>
      );
    });

    return <g key={"visibleStack"}>{coloredBars}</g>;
  }

  renderInvisibleStackedBars() {
    const { events, yAxisKey } = this.props;
    const {
      data,
      options,
      dataKeys,
      stackedData,
      barCanvasWidth,
      barHeight,
      mouseOverBar,
      x,
      y,
    } = this.state;

    // Insert a last, transparent bar component for each y-item stack; fill-opacity = 0
    // consists of a stack of two bars; one covers the visible bar, the other the empty space
    // These invisible stack components allows for a function to be passed as a prop to this
    // component that fires when a user's cursor hovers over the empty space to the right
    // of the bar. It also allows for the whole bar to be selected (e.g. via css) instead of
    // just pieces of the stack.
    const invisibleStackComponents = stackedData[stackedData.length - 1].map(
      (stackPieceRange, stackIndex) => {
        const yAttribute = data[stackIndex][yAxisKey];
        const xLeft = 0;
        const xMid = stackPieceRange[1];
        const xRight = barCanvasWidth;
        const yPosition = y(yAttribute);

        const fullXPosition = x(xLeft);
        const emptyXPosition = x(xMid);

        let fullWidth = x(xMid - xLeft) - options.bars.strokeWidth;
        if (fullWidth < 1) {
          fullWidth = 1;
        }

        let emptyWidth = xRight - x(xMid);
        if (emptyWidth < 1) {
          emptyWidth = 1;
        }

        const dataForStack = data[stackIndex];

        return (
          <g key={`${yAttribute}+invisiblebars`}>
            <rect
              y={yPosition}
              x={emptyXPosition}
              width={emptyWidth}
              height={barHeight}
              key={`${yAttribute}+emptybar`}
              className={cx(options.bars.emptySpaceClassName, cs.emptyBarSpace)}
              onMouseOver={() =>
                events.onBarEmptySpaceHover(yAttribute, dataForStack)
              }
              onMouseEnter={() => this.setState({ mouseOverBar: yAttribute })}
              onMouseOut={() => this.setState({ mouseOverBar: null })}
            />
            {mouseOverBar === yAttribute && (
              <rect
                y={yPosition}
                x={fullXPosition}
                width={fullWidth}
                height={barHeight}
                key={`${yAttribute}+fullbar`}
                className={cx(options.bars.fullBarClassName, cs.fullBar)}
              />
            )}
          </g>
        );
      }
    );

    return (
      <g
        key={"invisibleStack"}
        fillOpacity={0}
        strokeWidth={options.bars.strokeWidth}
      >
        {invisibleStackComponents}
      </g>
    );
  }

  renderXGrid() {
    const { options, x, barCanvasWidth, barCanvasHeight } = this.state;

    const tickCount = Math.floor(barCanvasWidth / options.x.tickSpacing);
    const xOffsets = x.ticks(tickCount, "s").map(value => x(value));

    const xGrid = xOffsets.map(xOffset => {
      return (
        <path
          d={`M ${xOffset} 0 v ${barCanvasHeight}`}
          key={`${xOffset}-grid-path`}
          className={cx(options.x.gridClassName, cs.xGrid)}
        />
      );
    });

    return xGrid;
  }

  render() {
    const { className, width } = this.props;
    const {
      x,
      y,
      options,
      labels,
      xAxisHeight,
      barHeight,
      barCanvasHeight,
      barCanvasWidth,
      yAxisWidth,
      measurementsTaken,
    } = this.state;

    if (measurementsTaken) {
      return (
        <div className={cx(className, cs.chart)}>
          <XAxis
            x={x}
            width={width}
            height={xAxisHeight}
            marginLeft={yAxisWidth}
            title={options.x.axisTitle}
            tickSize={options.x.tickSize}
            tickSpacing={options.x.tickSpacing}
            ticksVisible={options.x.ticksVisible}
            pathVisible={options.x.pathVisible}
            titleClassName={cx(options.x.axisTitleClassName, cs.xAxisTitle)}
            textClassName={cx(options.x.textClassName, cs.xAxisText)}
            barCanvasWidth={barCanvasWidth}
          />
          <div className={cx(options.canvasClassName, cs.canvas)}>
            <div className={cs.yAxis}>
              <YAxis
                y={y}
                labels={labels}
                width={yAxisWidth}
                height={barCanvasHeight}
                barHeight={barHeight}
                tickSize={options.y.tickSize}
                ticksVisible={options.y.ticksVisible}
                pathVisible={options.y.pathVisible}
                textClassName={cx(options.y.textClassName, cs.yAxisText)}
                onYAxisLabelClick={this.handleYAxisLabelClick}
              />
            </div>
            <div className={cs.barCanvas}>
              <svg width={width - yAxisWidth} height={barCanvasHeight}>
                <g>
                  {options.x.gridVisible && this.renderXGrid()}
                  {this.renderVisibleStackedBars()}
                  {this.renderInvisibleStackedBars()}
                </g>
              </svg>
            </div>
          </div>
        </div>
      );
    } else {
      // First determine the pixel length and height of the
      // x-axis and y-axis labels, so as to properly size the
      // dimensions of the chart.
      return (
        <div className={cx(className, cs.chart)}>
          {this.renderAxisBaselines()}
        </div>
      );
    }
  }
}

HorizontalStackedBarChart.defaultProps = {
  options: defaults,
};

HorizontalStackedBarChart.propTypes = {
  data: PropTypes.array,
  keys: PropTypes.array,
  width: PropTypes.number,
  options: PropTypes.object,
  events: PropTypes.shape({
    onYAxisLabelClick: PropTypes.func,
    onBarStackHover: PropTypes.func,
    onBarEmptySpaceHover: PropTypes.func,
  }),
  yAxisKey: PropTypes.string,
  className: PropTypes.string,
};
