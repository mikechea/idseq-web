import React from 'react';
import SubHeader from './SubHeader';
import symlog from './symlog';
import * as d3 from 'd3';
import {event as currentEvent} from 'd3';
import axios from 'axios';
import ObjectHelper from '../helpers/ObjectHelper';
import clusterfck from 'clusterfck';
import ReactNouislider from './ReactNouislider';
import NumAbbreviate from 'number-abbreviate';
import { Button, Popup } from 'semantic-ui-react'
import copy from 'copy-to-clipboard';
import width from 'text-width';

class SampleHeatmapTooltip extends React.Component {
  constructor(props) {
    super(props);
  }

  renderTaxons () {
    let taxon = this.props.taxon;
    if (!taxon) {
      return
    }

    let valueMap = [
        ['Agg Score', 'NT.aggregatescore'],
        null,
        ['NT RPM', 'NT.rpm'],
        ['NR RPM', 'NR.rpm'],
        ['NT R', 'NT.r'],
        ['NR R', 'NR.r'],
        ['NT Z', 'NT.zscore'],
        ['NR Z', 'NR.zscore'],
        ['NT Max Z', 'NT.maxzscore'],
        ['NR Max Z', 'NR.maxzscore'],
    ]
    let ret = [
      <li className="col s12" key="taxon-name">
        <label>Taxon:</label>{taxon.name}
      </li>
    ];
    valueMap.forEach(function (pair) {
      if (!pair) {
        ret.push(<li key="blank" className="col s6">&nbsp;</li>);
        return;
      }

      let key = pair[0],
          value = pair[1];

      let parts = value.split("."),
            base = taxon;

      for (var part of parts) {
        base = base[part];
      }
      ret.push(<li className="col s6" key={"taxon-" + value + "-value"}>
        <label>{key}:</label>
        {base.toFixed(1)}
      </li>);
    });
    return ret;
  }
  render () {
    let sample = this.props.sample;
    return (
      <div className="heatmap-tooltips">
        <ul className="row">
          <li className="col s12">
            <label>Sample:</label>{sample.name}
          </li>
          {this.renderTaxons()}
        </ul>
      </div>
    )
  }
}

class D3Heatmap extends React.Component {
  constructor(props) {
    super(props);

    this.state = {}
    this.colors = this.props.colors || [
      '#FFFFFF',
      '#F9F1F4',
      '#F3E4EA',
      '#EDD6E0',
      '#E7C9D6',
      '#E2BBCC',
      '#DCAEC2',
      '#D6A1B8',
      '#D093AE',
      '#CA86A4',
      '#C57899',
      '#BF6B8F',
      '#B95D85',
      '#B3507B',
      '#AD4371',
      '#A83567',
      '#A2285D',
      '#9C1A53',
      '#960D49',
      '#91003F',
    ];

    this.initializeData(this.props);
  }

  initializeData (props) {
    this.row_number = props.rows;
    this.col_number = props.columns;

    this.rowLabel = [];
    this.colLabel = [];

    let char_width = 8,
        longest_row_label = 0,
        longest_col_label = 0;

    // Figure out column and row labels
    for (let i = 0; i < this.row_number; i += 1) {
      let label = props.getRowLabel(i)
      this.rowLabel.push(label);
      let row_width = width(label, {
        size: '8pt',
      });

      longest_row_label = Math.max(longest_row_label, row_width);
    }

    for (let j = 0; j < this.col_number; j += 1) {
      let label = props.getColumnLabel(j);
      this.colLabel.push(label);
      let col_width = width(label, {
        size: '8pt',
      });
      longest_col_label = Math.max(longest_col_label, col_width);
    }

    // Generate the grid data
    this.data = [];
    this.min = 999999999;
    this.max = -999999999;

    for (var i = 0; i < this.row_number; i += 1) {
      for (var j = 0; j < this.col_number; j += 1) {
        var col = this.colLabel[j];
        let value = props.getCellValue(i, j);
        this.data.push({
          row: i,
          col: j,
          value: value,
        });
        if (value !== undefined) {
          this.min = Math.min(this.min, value);
          this.max = Math.max(this.max, value);
        }
      }
    }
    this.margin ={
      top: longest_col_label * Math.cos(25 * (Math.PI / 180)) + 10,
      left: Math.ceil(Math.sqrt(this.row_number)) * 10,
      bottom: 80,
      right: longest_row_label + 20
    };
    this.cellWidth = Math.max(900 / this.col_number, 20);
    this.cellHeight = Math.max(400 / this.row_number, 15);

    this.width = this.cellWidth * this.col_number + this.margin.left + this.margin.right;
    this.height = this.cellHeight * this.row_number + this.margin.top + this.margin.bottom;

    this.colTree = props.colTree;
    this.rowTree = props.rowTree;
    this.scale = props.scale;
    this.legendElementWidth = this.margin.right / this.colors.length;
  }

  componentDidMount () {
    this.renderD3();
  }

  renderD3 () {
    let that = this

    this.svg = d3.select(this.container).append("svg")
      .attr("width", this.width)
      .attr("height", this.height);

    this.offsetCanvas = this.svg.append("g")
      .attr("transform", "translate(" + this.margin.left + "," + this.margin.top + ")");


    this.renderRowLabels();
    this.renderColLabels();
    this.renderHeatmap();
    //this.renderLegend();
    this.renderColDendrogram();
    this.renderRowDendrogram();
  }

  renderHeatmap () {
    let colorScale = this.scale()
        .domain([this.min, this.max])
        .range([0, this.colors.length-1]);

    let that = this;
    var heatMap = this.offsetCanvas.append("g").attr("class","g3")
      .selectAll(".cellg")
      .data(this.data, function (d) {
        return d.row + ":" + d.col;
      })
      .enter()
      .append("rect")
      .attr("x", function(d, i) { return d.col * that.cellWidth; })
      .attr("y", function(d) { return d.row * that.cellHeight; })
      .attr("class", function(d){return "cell cell-border cr"+d.row+" cc"+d.col })
      .attr("width", this.cellWidth)
      .attr("height", this.cellHeight)
      .style("fill", function(d) {
        if (d.value === undefined) {
          return "rgb(238, 241, 244)";
        }
        let colorIndex = colorScale(d.value);
        return that.colors[Math.round(colorIndex)];
      })
      .on("click", this.props.onCellClick)
      .on("mouseover", function(d){
         //highlight text
         d3.select(this).classed("cell-hover",true);
         d3.selectAll(".rowLabel").classed("text-highlight",function(r,ri){ return ri==d.row;});
         d3.selectAll(".colLabel").classed("text-highlight",function(c,ci){ return ci==d.col;});

         d3.select(that.tooltip)
           .style("left", (currentEvent.pageX+10) + "px")
           .style("top", (currentEvent.pageY-10) + "px")
          d3.select(that.tooltip).classed("hidden", false);
          that.setState({
            hoverRow: d.row,
            hoverColumn: d.col,
          });
      })
      .on("mouseout", function(){
             d3.select(this).classed("cell-hover",false);
             d3.selectAll(".rowLabel").classed("text-highlight",false);
             d3.selectAll(".colLabel").classed("text-highlight",false);
             d3.select(that.tooltip).classed("hidden", true);
      })
      ;

  }

  renderColDendrogram () {
		let width = this.cellWidth * this.col_number,
				height = this.margin.bottom - 20;

    let top_offset = this.margin.top + (this.cellHeight * this.row_number) + 10;
    let container = this.renderDendrogram(this.colTree, width, height, "cc", this.colLabel);
    container.attr("transform", "rotate(90) translate(" + top_offset + ", -" + (width + this.margin.left) + ")");
    container.select("g").attr("transform", "scale(-1, 1) translate(-" + (this.margin.bottom - 20) + ", 0)");
  }

  renderRowDendrogram () {
    let height = this.margin.left - 20,
        width = this.cellHeight * this.row_number;

    let container = this.renderDendrogram(this.rowTree, width, height, "cr", this.rowLabel);
    container.attr("transform", "translate(10, " + this.margin.top + ")")
  }

  renderDendrogram (tree, width, height, cssClass, labels) {
		var cluster = d3.layout.cluster()
    		.size([width, height])
        .separation(function () { return 1; });

		let diagonal = (d, i) => {
    	return "M" + d.source.y + "," + d.source.x + "V" + d.target.x + "H" + d.target.y;
		}

		//var diagonal = d3.svg.diagonal()
    //		.projection(function(d) { return [d.y, d.x]; });

    //set up the visualisation:
    let visContainer = this.svg.append("g")
      .attr("width", width)
      .attr("height", height)

    let vis = visContainer.append("g")

    cluster.children(function (d) {
      let children = [];
      if (d.left) {
        children.push(d.left);
      }
      if (d.right) {
        children.push(d.right);
      }
      return children;
    });

    var nodes = cluster.nodes(tree);

    let i = 0;
    for (let n of nodes) {
      n.id = i;
      i += 1;
    }
    var link = vis.selectAll("path.link." + cssClass + "-link")
      .data(cluster.links(nodes))
      .enter().append("path")
      .attr("class", function (e) {
        return "link " + cssClass + "-link " + cssClass + "-link-" + e.source.id + "-" + e.target.id;
      })
      .attr("d", diagonal);

    var hovers = vis.selectAll("rect.hover-target." + cssClass + "-hover-target")
      .data(cluster.links(nodes))
      .enter().append("rect")
      .attr("class", function (e) {
        return "hover-target " + cssClass + "-hover-target " + cssClass + "-hover-" + e.source.id + "-" + e.target.id;
      })
      .attr("x", function(d, i) { return Math.min(d.source.y, d.target.y); })
      .attr("y", function(d, i) { return Math.min(d.source.x, d.target.x); })
      .attr("width", function (d, i) {
        let targetY = Math.max(d.source.left.y, d.source.right.y)
        return Math.abs(targetY - d.source.y);
      })
      .attr("height", function (d, i) { return Math.abs(d.target.x - d.source.x); })
      .attr("fill", "rgba(0,0,0,0)")
      .on("mouseover", (d) => {
        d3.selectAll(".D3Heatmap").classed("highlighting", true);
        let base = d.source.children.slice();
        let to_visit = base;
        while(to_visit.length > 0) {
          let node = to_visit.pop();
          if(node.left) { to_visit.push(node.left); }
          if(node.right) { to_visit.push(node.right); }
          let cls = "." + cssClass + "-link-" + node.parent.id + "-" + node.id;
          d3.selectAll(cls).classed("link-hover", true);i

          if(node.label) {
            let idx = labels.indexOf(node.label);
            let selector = "." + cssClass + idx;
            d3.selectAll(selector).classed("highlight", true);
          }
        }
      })
      .on("mouseout", function (d) {
          d3.selectAll(".D3Heatmap").classed("highlighting", false);
          d3.selectAll("." + cssClass + "-link").classed("link-hover", false);
          d3.selectAll(".D3Heatmap .highlight").classed("highlight", false);
      });
    /*
		var node = vis.selectAll("g.node")
				.data(nodes)
			.enter().append("g")
				.attr("class", "node")
				.attr("transform", function(d) { return "translate(" + d.y + "," + d.x + ")"; })

		node.append("circle")
			.attr("r", 4.5);
  	node.append("text")
      .attr("dy", 3)
      .attr("x", function(d) { return d.children ? -8 : 8; })
      .style("text-anchor", function(d) { return d.children ? "end" : "start"; })
      .text(function(d) {
				if (d.sample) {
					return d.sample.name;
				}
			});
      */
    return visContainer;
  }

  renderLegend () {
    let that = this,
        height = 20,
        x_offset = this.cellWidth * this.col_number;

    this.offsetCanvas.selectAll(".legend-text-min")
        .data([this.min])
        .enter().append("text")
        .attr("x", x_offset)
        .attr("y", -33)
        .attr("class", "mono")
        .text(Math.round(this.min));

    this.offsetCanvas.selectAll(".legend-text-max")
        .data([this.max])
        .enter().append("text")
        .attr("class", "mono")
        .attr("x", function (d, i) { return x_offset + that.legendElementWidth * that.colors.length; })
        .attr("y", -33)
        .text(Math.round(this.max))
        .style("text-anchor", "end");

    var legend = this.offsetCanvas.selectAll(".legend")
      .data(this.colors)
      .enter().append("g")
      .attr("class", "legend");

    legend.append("rect")
      .attr("x", function(d, i) { return Math.floor(x_offset + that.legendElementWidth * i); })
      .attr("y", -10 - height)
      .attr("width", Math.ceil(this.legendElementWidth))
      .attr("height", height)
      .style("fill", function(d, i) { return that.colors[i]; });

	  this.offsetCanvas.append("rect")
        .attr("x", function(d, i) { return x_offset + that.legendElementWidth * i; })
        .attr("stroke", "#aaa")
        .attr("stroke-width", "0.25")
        .style("fill", "none")
        .attr("y", -10 - height)
        .attr("width", that.legendElementWidth * that.colors.length)
        .attr("height", height);
  }

  renderRowLabels () {
    let rowSortOrder=false;
    let that = this;
    let rowLabels = this.offsetCanvas.append("g")
        .selectAll(".rowLabelg")
        .data(this.rowLabel)
        .enter();

    let groups = rowLabels.append("g")
        .attr("class", "rowLabelg")
        .attr("transform", "translate(" + (this.cellWidth * this.col_number) + ", 0)")
        .on("mouseover", function(d) {
          d3.select(this).classed("text-hover",true);
        })
        .on("mouseout" , function(d) {
          d3.select(this).classed("text-hover",false);
        });

    groups.append("rect")
        .attr("y", function (d, i) {
          return i * that.cellHeight;
        })
        .attr("width", this.margin.right)
        .attr("height", this.cellHeight)
        .style("fill", "#fff");

    groups.append("text")
        .text(function (d) { return d; })
        .attr("y", function (d, i) {
          return i * that.cellHeight;
        })
        .attr("transform", "translate(8," + this.cellHeight / 1.5 + ")")
        .attr("class", function (d,i) {
          return "rowLabel mono r"+i;}
        )

    groups.append("text")
        .attr("class", "removeLink mono")
        .text("x")
        .attr("y", function (d, i) {
          return i * that.cellHeight;
        })
        .attr("transform", "translate(" + this.margin.right + "," + this.cellHeight / 1.5 + ")")
        .style("text-anchor", "end")
        .on("click", (d,i) => {
          this.props.onRemoveRow(d);
        });
  }

  renderColLabels () {
    let colSortOrder = false;
    let that = this;
    let colLabels = this.offsetCanvas.append("g")
      .selectAll(".colLabelg")
      .data(this.colLabel)
      .enter()
      .append("g")
      .attr("transform", function (d, i) {
        return "translate(" + that.cellWidth * i + ",-6)"
      })
      .append("text")
      .text(function (d) { return d; })
      .attr("x", 0)
      .attr("y", 0)
      .style("text-anchor", "left")
      .attr("transform", "translate("+this.cellWidth/2 + ",-6) rotate (-65)")
      .attr("class",  function (d,i) { return "colLabel mono c"+i;} )
      .on("mouseover", function(d) {d3.select(this).classed("text-hover",true);})
      .on("mouseout" , function(d) {d3.select(this).classed("text-hover",false);})
      // .on("click", function(d,i) {colSortOrder=!colSortOrder;  that.sortbylabel("c",i,colSortOrder);});
  }

  sortbylabel(rORc, i, sortOrder) {
    let that = this
    var svg = this.svg;
    var t = svg.transition().duration(1000);
    var log2r=[];
    var sorted; // sorted is zero-based index

    svg.selectAll(".c"+rORc+i).filter(function (ce) {
      log2r.push(ce.value);
    });

    if (rORc=="r") { // sort log2ratio of a gene
     sorted=d3.range(that.col_number).sort(function(a,b){ if(sortOrder){ return log2r[b]-log2r[a];}else{ return log2r[a]-log2r[b];}});
     t.selectAll(".cell")
       .attr("x", function(d) { return sorted.indexOf(d.col) * that.cellWidth; })
       ;
     t.selectAll(".colLabel")
      .attr("y", function (d, i) { return sorted.indexOf(i) * that.cellHeight; })
     ;
    }else{ // sort log2ratio of a contrast
     sorted=d3.range(that.row_number).sort(function(a,b){if(sortOrder){ return log2r[b]-log2r[a];}else{ return log2r[a]-log2r[b];}});
     t.selectAll(".cell")
       .attr("y", function(d) { return sorted.indexOf(d.row) * that.cellHeight; })
       ;
     t.selectAll(".rowLabel")
      .attr("y", function (d, i) { return sorted.indexOf(i) * that.cellHeight; })
     ;
    }
  }

  componentWillReceiveProps (nextProps) {
    if (ObjectHelper.shallowEquals(nextProps, this.props)) {
      return;
    }
    d3.select(".D3Heatmap svg").remove();
    this.initializeData(nextProps);
    this.renderD3();
  }

  renderTooltip () {
    if (this.state.hoverRow === undefined) {
      return;
    }

    return (
      <div className="heatmap-tooltip hidden" ref={(tooltip) => { this.tooltip = tooltip; }} >
        {this.props.getTooltip(this.state.hoverRow, this.state.hoverColumn)}
      </div>)
  }

  render () {
    return (
      <div className="D3Heatmap">
        {this.renderTooltip()}
        <div ref={(container) => { this.container = container; }} >
        </div>
      </div>
    )
  }
}

class SamplesHeatmap extends React.Component {
  constructor(props) {
    super(props);

    this.scales = [
      ["Symmetric Log", symlog],
      ["Linear", d3.scale.linear],
    ];

    this.colors = [
      "rgb(255, 255, 255)",
      "rgb(243, 249, 243)",
      "rgb(232, 244, 232)",
      "rgb(221, 239, 220)",
      "rgb(210, 234, 209)",
      "rgb(199, 229, 197)",
      "rgb(188, 224, 186)",
      "rgb(177, 219, 175)",
      "rgb(166, 214, 164)",
      "rgb(155, 208, 152)",
      "rgb(144, 203, 141)",
      "rgb(133, 198, 129)",
      "rgb(122, 193, 118)",
      "rgb(111, 188, 106)",
      "rgb(100, 183, 95)",
      "rgb(89, 178, 84)",
      "rgb(78, 173, 73)",
		];

    this.dataTypes = ["NT.aggregatescore", "NT.rpm", "NT.r", "NT.zscore", "NT.maxzscore", "NR.rpm", "NR.r", "NR.zscore", "NR.maxzscore"];
    this.dataGetters = {}
    this.dataAccessorKeys = {};
    for (var dataType of this.dataTypes) {
      this.dataGetters[dataType] = this.makeDataGetter(dataType);
      this.dataAccessorKeys[dataType] = dataType.split(".");
    }

    let urlParams = this.fetchParamsFromUrl();
    this.state = {
      loading: false,
      data: undefined,
      species: urlParams.species || "0",
      dataType: urlParams.dataType || "NT.aggregatescore",
      dataScaleIdx: urlParams.dataScaleIdx || 0,
      minDataThreshold: urlParams.minDataThreshold || -99999999999,
      maxDataThreshold: urlParams.maxDataThreshold || 99999999999,
      sample_ids: urlParams.sample_ids || [],
      taxon_ids: urlParams.taxon_ids || [],
    };
    this.updateUrlParams();
  }

  updateUrlParams (newParams) {
    newParams = {};
    let url = new URL(window.location);
    let sp = url.searchParams;

    let lst_to_comma = function (l) {
      if (l == null) {
        return null;
      } else {
        return l.join(",");
      }
    };
    sp.set("species", newParams["species"] || this.state.species);
    sp.set("dataType", newParams["dataType"] || this.state.dataType);
    sp.set("dataScaleIdx", newParams["dataScaleIdx"] || this.state.dataScaleIdx);
    sp.set("minDataThreshold", newParams["minDataThreshold"] || this.state.minDataThreshold);
    sp.set("maxDataThreshold", newParams["maxDataThreshold"] || this.state.maxDataThreshold);
    sp.set("sample_ids", lst_to_comma(newParams["sample_ids"]) || this.state.sample_ids);
    sp.set("taxon_ids", lst_to_comma(newParams["taxon_ids"]) || this.state.taxon_ids);
    window.history.replaceState(null, null, url.toString());
  }

  fetchParamsFromUrl () {
    let sp = new URL(window.location).searchParams;

    let ion = function(x) {
      return (x == null) ? null : parseFloat(x);
    }

    let lon = function (x) {
      return (x == null) ? null : x.split(",").map(function(j) { return parseInt(j, 10); });
    }

    return {
      species: sp.get("species"),
      dataType: sp.get("dataType"),
      dataScaleIdx: ion(sp.get("dataScaleIdx")),
      minDataThreshold: ion(sp.get("minDataThreshold")),
      maxDataThreshold: ion(sp.get("maxDataThreshold")),
      sample_ids: lon(sp.get("sample_ids")),
      taxon_ids: lon(sp.get("taxon_ids")),
    }
  }

  getDataProperty (data, property) {
    let keys = this.dataAccessorKeys[property];
    return data[keys[0]][keys[1]];
  }

  makeDataGetter (dataType) {
    let that = this;
    return function (row, col) {
      let taxon = this.getTaxonFor(row, col);
      if (taxon) {
        let value = this.getDataProperty(taxon, dataType);
        if (value >= this.state.minDataThreshold && value <= this.state.maxDataThreshold) {
          return value;
        }
      }
    }
  }

  componentDidMount () {
    this.fetchDataFromServer(this.state.taxon_ids, this.state.species);
  }

  componentDidUpdate () {
    this.updateUrlParams(this.state);
  }

  fetchDataFromServer (taxon_ids, species) {
    this.setState({loading: true})

    let url = "/samples/samples_taxons.json?sample_ids=" + this.state.sample_ids;
    if (taxon_ids) {
      url += "&taxon_ids=" + taxon_ids;
    }
    if (species == "1") {
      url += "&species=1"
    }
    this.request = axios.get(url)
    .then((response) => {
      let taxons = this.extractTaxons(response.data);
      this.setState({
        taxon_ids: taxons.ids,
        data: response.data,
        taxons: taxons,
      });
    }).then(() => {
      this.setState({ loading: false });
    });
  }

  getMinMax () {
    let data = this.state.data;
    let dataType = this.state.dataType;
    let taxon_names = this.state.taxons.names;
    let taxon_lists = [];
    taxon_names = new Set(taxon_names);
    for (let sample of data) {
      let sample_taxons = [];
      for (let taxon of sample.taxons) {
        if (taxon_names.has(taxon.name)) {
          taxon_lists.push(taxon);
        }
      }
      taxon_lists.push(sample_taxons);
    }
    let taxons = [].concat.apply([], taxon_lists);
    let min = d3.min(taxons, (d) => {
      return this.getDataProperty(d, dataType);
    });
    let max = d3.max(taxons, (d) => {
      return this.getDataProperty(d, dataType);
    });
    let thresholdMin = d3.min(taxons, (d) => {
      let value = this.getDataProperty(d, dataType);
      if (value >= this.state.minDataThreshold && value <= this.state.maxDataThreshold) {
        return value;
      }
      return null;
    });

    let thresholdMax = d3.max(taxons, (d) => {
      let value = this.getDataProperty(d, dataType);
      if (value >= this.state.minDataThreshold && value <= this.state.maxDataThreshold) {
        return value;
      }
      return null;
    });

    return {
      min: min,
      max: max,
      thresholdMin: thresholdMin,
      thresholdMax: thresholdMax,
    };
  }

  clusterSamples (data, dataType, taxons) {
    let vectors = [];
    for (let sample of data) {
      let vector = [];
      for (let taxon_name of taxons) {
        let value = null;
        for(let taxon of sample.taxons) {
          if (taxon.name == taxon_name) {
            value = this.getDataProperty(taxon, dataType);
            break;
          }
        }
        vector.push(value);
      }
      vector.sample = sample;
      vectors.push(vector);
    }

    let cluster = clusterfck.hcluster(vectors);

    let clustered_samples = [];
    let to_visit = [cluster];
    while (to_visit.length > 0) {
      let node = to_visit.pop();
      if (node.right) {
        to_visit.push(node.right);
      }
      if (node.left) {
        to_visit.push(node.left);
      }

      if (node.value) {
				node.label = node.value.sample.name;
        clustered_samples.push(node.value.sample);
      }
    }

    return {
      tree: cluster,
      flat: clustered_samples.reverse(),
    }
  }

  extractTaxons (data) {
    let id_to_name = {},
        name_to_id = {},
        ids = new Set();

    for (var i = 0, len = data.length; i < len; i += 1) {
      let sample = data[i];
      for (var j = 0; j < sample.taxons.length; j+= 1) {
        let taxon = sample.taxons[j];
        id_to_name[taxon.tax_id] = taxon.name;
        name_to_id[taxon.name] = taxon.tax_id;
        ids.add(taxon.tax_id);
      }
    }

    return {
      id_to_name: id_to_name,
      name_to_id: name_to_id,
      ids: Array.from(ids),
      names: Object.keys(name_to_id),
    };
  }

  clusterTaxons (data, dataType, taxon_names) {
    let taxon_scores = {};
    for (let taxon of taxon_names) {
      taxon_scores[taxon] = [];

      for (let sample of data) {
        let value = null;
        for (let sample_taxon of sample.taxons) {
          if (sample_taxon.name == taxon) {
            value = this.getDataProperty(sample_taxon, dataType);
            break;
          }
        }
        taxon_scores[taxon].push(value);
      }
    }

    let vectors = [];
    for(let key of Object.keys(taxon_scores)) {
      let vector = taxon_scores[key];
      vector.taxon_name = key;
      vectors.push(vector);
    }
    let cluster = clusterfck.hcluster(vectors);
    let clustered_taxons = [];
    let to_visit = [cluster];
    while (to_visit.length > 0) {
      let node = to_visit.pop();
      if (node.right) {
        to_visit.push(node.right);
      }
      if (node.left) {
        to_visit.push(node.left);
      }

      if (node.value) {
				node.label = node.value.taxon_name;
        clustered_taxons.push(node.value.taxon_name);
      }
    }

    return {
      tree: cluster,
      flat: clustered_taxons,
    }
  }

  getColumnLabel (column_index) {
    return this.clustered_samples.flat[column_index].name;
  }

  getRowLabel (row_index) {
    return this.clustered_taxons.flat[row_index];
  }

  getTaxonFor (row_index, column_index) {
    let d = this.clustered_samples.flat[column_index];
    let taxon_name = this.clustered_taxons.flat[row_index];

    for (let i = 0; i < d.taxons.length; i += 1) {
      let taxon = d.taxons[i];
      if (taxon.name == taxon_name) {
        return taxon;
      }
    }
    return undefined;
  }

  getTooltip (row_index, column_index) {
    let sample = this.clustered_samples.flat[column_index],
        taxon_name = this.clustered_taxons.flat[row_index],
        taxon;

    for (let i = 0; i < sample.taxons.length; i += 1) {
      let ttaxon = sample.taxons[i];
      if (ttaxon.name == taxon_name) {
        taxon = ttaxon;
        break;
      }
    }

    return (
      <SampleHeatmapTooltip sample={sample} taxon={taxon} />
    )

  }

  renderLoading () {
    return (<p className="loading-indicator text-center">Loading...</p>);
  }

  onCellClick (d) {
    let sample = this.clustered_samples.flat[d.col];
    window.location.href = "/samples/" + sample.sample_id;
  }

  onRemoveRow (rowLabel) {
    let taxons = this.state.taxons;
    let id = taxons.name_to_id[rowLabel];

    let idx = taxons.names.indexOf(rowLabel);
    taxons.names.splice(idx, 1);

    idx = taxons.ids.indexOf(id);
    taxons.ids.splice(idx, 1);

    delete taxons.name_to_id[rowLabel];
    delete taxons.id_to_name[id];
    this.setState({
      taxon_ids: taxons.ids,
      taxons: taxons,
    });
  }

  renderHeatmap () {
    if (!this.state.data) {
      return;
    }
    return (
      <D3Heatmap
        colTree={this.clustered_samples.tree}
        rowTree={this.clustered_taxons.tree}
        rows={this.state.taxons.ids.length}
        columns={this.state.data.length}
        getRowLabel={this.getRowLabel.bind(this)}
        getColumnLabel={this.getColumnLabel.bind(this)}
        getCellValue={this.dataGetters[this.state.dataType].bind(this)}
        getTooltip={this.getTooltip.bind(this)}
        onCellClick={this.onCellClick.bind(this)}
        onRemoveRow={this.onRemoveRow.bind(this)}
        scale={this.scales[this.state.dataScaleIdx][1]}
        colors={this.colors}
      />
    )
  }

  updateDataType (e) {
    let newDataType = e.target.value;
    this.setState({
      dataType: newDataType,
      minDataThreshold: -99999999999,
      maxDataThreshold: 99999999999,
    });
  }

  renderTypePickers () {
   if (!this.state.data) {
      return;
    }

    let ret = [];
    for (var dataType of this.dataTypes) {
      ret.push(
        <option key={dataType} value={dataType}>{dataType}</option>
      )
    }
    return (
      <select value={this.state.dataType} onChange={this.updateDataType.bind(this)}>
        {ret}
      </select>
    )
  }

  updateDataThreshold (e) {
    this.setState({
      minDataThreshold: parseFloat(e[0]),
      maxDataThreshold: parseFloat(e[1])
    });
  }

  renderThresholdSlider () {
    if (!this.state.data) {
      return;
    }
    return (
      <div className="range-field">
        <div className="slider-container">
          <ReactNouislider
            range={{min: this.minMax.min, max: this.minMax.max + 1}}
            start={[this.state.minDataThreshold, this.state.maxDataThreshold]}
            connect={[false, true, false]}
            onChange={this.updateDataThreshold.bind(this)}
            tooltips
          />
        </div>
      </div>
    )
  }

  taxonLevelChanged (e) {
    this.setState({ species: e.target.value, data: null });
    this.fetchDataFromServer(null, e.target.value);
  }

  renderTaxonLevelPicker () {
    if (!this.state.data) {
      return;
    }
    return (
      <select value={this.state.species} onChange={this.taxonLevelChanged.bind(this)}>
        <option value="0">Genus</option>
        <option value="1">Species</option>
      </select>
    );
  }

  updateDataScale (e) {
    this.setState({ dataScaleIdx: e.target.value });
  }

  renderScalePicker () {
    if (!this.state.data) {
      return;
    }

    let ret = [];

    for (let i = 0; i < this.scales.length; i += 1) {
      let scale = this.scales[i];
      ret.push(
        <option key={i} value={i}>{scale[0]}</option>
      )
    }
    return (
      <select value={this.state.dataScaleIdx} onChange={this.updateDataScale.bind(this)}>
        {ret}
      </select>
    )
 }
  renderLegend () {
    if (!this.state.data) {
      return;
    }
    return <D3HeatmapLegend colors={this.colors} min={this.minMax.thresholdMin} max={this.minMax.thresholdMax} />
  }

  onShareClick () {
    copy(window.location);
  }

  render () {
    if (this.state.data) {
      this.clustered_samples = this.clusterSamples(this.state.data, this.state.dataType, this.state.taxons.names);
      this.clustered_taxons = this.clusterTaxons(this.state.data, this.state.dataType, this.state.taxons.names);
      this.minMax = this.getMinMax();
    }
    return (
      <div id="project-visualization">
        <SubHeader>
          <div>
            <Popup
              trigger={<Button className="right" primary onClick={this.onShareClick.bind(this)}>Share</Button>}
              content='A shareable URL has been copied to your clipboard!'
              on='click'
              hideOnScroll
            />
           <h2>Comparing {this.state.data ? this.state.data.length : ''} samples</h2>
          </div>
        </SubHeader>
        <div className="container">
          <div className="row sub-menu">
            <div className="col s2">
              <label>Taxon Level</label>
              {this.renderTaxonLevelPicker()}
            </div>
            <div className="col s2">
              <label>Data Scale</label>
              {this.renderScalePicker()}
            </div>
            <div className="col s2">
              <label>Data Type</label>
              {this.renderTypePickers()}
            </div>
            <div className="col s3">
              <label>Thresholds</label>
              {this.renderThresholdSlider()}
            </div>
            <div className="col s2">
              <label>Legend</label>
              {this.renderLegend()}
            </div>
          </div>
        </div>
        <div className="row visualization-content">
          {this.state.loading && this.renderLoading()}
          {this.renderHeatmap()}
        </div>
      </div>
    );
  }
}

class D3HeatmapLegend extends React.Component {
  componentDidMount () {
    this.renderD3(this.props);
  }

  renderD3 (props) {
    this.svg = d3.select(this.container).append("svg")
        .attr("width", "100%")
        .attr("height", "35");

    let that = this,
        height = 20,
        legendElementWidth = 100 / props.colors.length;

    this.svg.selectAll(".legend-text-min")
        .data([this.min])
        .enter().append("text")
        .attr("x", 0)
        .attr("y", 35)
        .attr("class", "mono")
        .text(NumAbbreviate(Math.round(props.min)));

    this.svg.selectAll(".legend-text-max")
        .data([props.max])
        .enter().append("text")
        .attr("class", "mono")
        .attr("x", "100%")
        .attr("y", 35)
        .text(NumAbbreviate(Math.round(props.max)))
        .style("text-anchor", "end");

    var legend = this.svg.selectAll(".legend")
      .data(props.colors)
      .enter().append("g")
      .attr("class", "legend");

    legend.append("rect")
      .attr("x", function(d, i) { return Math.floor(legendElementWidth * i) + "%"; })
      .attr("y", 0)
      .attr("width", Math.ceil(legendElementWidth) + "%")
      .attr("height", height)
      .style("fill", function(d, i) { return that.props.colors[i]; });

	  this.svg.append("rect")
        .attr("x", "0")
        .attr("stroke", "#aaa")
        .attr("stroke-width", "0.25")
        .style("fill", "none")
        .attr("y", 0)
        .attr("width", "100%")
        .attr("height", height);


  }
  componentWillReceiveProps (nextProps) {
    if (ObjectHelper.shallowEquals(nextProps, this.props)) {
      return;
    }
    d3.select(this.container).select("svg").remove();
    this.renderD3(nextProps);
  }

  render () {
    return (
      <div className="heatmap-legend" ref={(container) => { this.container = container; }} >
      </div>
    );
  }
}
export default SamplesHeatmap;