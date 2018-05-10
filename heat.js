const ZIPCODE_URL = "https://raw.githubusercontent.com/hvo/datasets/master/nyc_zip.geojson";

d3.queue()
  .defer(d3.json, ZIPCODE_URL)
  .await(initVisualization);


function initVisualization(error, zipcodes) {
  let svg       = d3.select("svg"),
      gChart    = svg.append("g"),

      baseMap   = createBaseMap(),

      selection = {year: 'All', data: []};


      client    = new carto.Client({
                    apiKey: 'NotNeeded',
                    username: 'ninanurrahmawati',
                  });

  createMap(baseMap, zipcodes, selection);

  createChartFromCarto(client, gChart, baseMap[1], selection);


}


function createChartFromCarto(client, gChart, gMap, selection) {

  const resData = new carto.source.SQL(`
    SELECT *
      FROM ninanurrahmawati.heat_complaints
  `);

  var initBarChart = function (newData) {
    let byYear = newData.categories.map(d => [d.name, d.value]);
    createChart(gChart, byYear, resData, selection);

    totalView.off('dataChanged', initBarChart);
  }










  const totalView = new carto.dataview.Category(
    resData,  'year', {
      operation: carto.operation.SUM,
			operationColumn: 'heating_complaint',
      limit: 1000,
  }).on('dataChanged', initBarChart);









  const zipView = new carto.dataview.Category(
    resData,  'zipcode', {
      operation: carto.operation.SUM,
			operationColumn: 'heating_complaint',
      limit: 2000,
  }).on('dataChanged', newData => {
		console.log(newData)


    selection.data = newData.categories.map(d => [d.name, d.value]);
    updateMap(gMap, selection);
  });



  client.addDataview(totalView);
  client.addDataview(zipView);
}










function createChart(g, byYear, sqlSource, selection) {
  let data     = byYear.sort((a, b) => a[0] > b[0] ? 1 : -1),
      maxValue = d3.max(data, d => d[1]),
      x        = d3.scaleLinear()
                   .domain([0, maxValue])
                   .rangeRound([0, 300]),
      yb       = d3.scaleBand()
                   .domain(data.map(d => d[0]))
                   .rangeRound([50, 400]),
      cHeight  = yb(data.slice(-1)[0][0])-yb.bandwidth();

  g.append("g")
    .attr("class", "axis axis--x")
    .attr("transform", "translate(165,50)")
    .call(d3.axisTop(x).ticks(5));

  g.append("g")
    .attr("class", "axis axis--y")
    .attr("transform", "translate(160,0)")
    .call(d3.axisLeft(yb));

  g.append("g")
    .attr("class", "grid axis--x")
    .attr("transform", "translate(165,50)")
    .call(d3.axisTop(x).ticks(5).tickSize(-cHeight).tickFormat(""));

  g.append("g")
    .attr("class", "axis axis--x")
    .attr("transform", `translate(165,${yb.range()[1]})`)
    .call(d3.axisBottom(x).ticks(5))
    .append("text")
      .attr("class", "label")
      .attr("x", 150)
      .attr("y", 40)
      .text("Number of Heat Complaints");

  g.selectAll(".bar")
    .data(data)
    .enter().append("rect")
      .attr("class", "bar")
      .attr("x", 165)
      .attr("y", function(d,i) { return yb(d[0]); })
      .attr("width", function(d,i) { return x(d[1]); })
      .attr("height", yb.bandwidth()-2)
      .on("mouseover", function(d, i) {
        d3.select(this)
          .transition().duration(300)
          .attr("x", 165-10)
          .attr("y", yb(d[0])-2)
          .attr("width", x(d[1])+20)
          .attr("height", yb.bandwidth()+2);
      })
      .on('click', function (d,i) {



        var query = `
          SELECT *
            FROM ninanurrahmawati.heat_complaints
           WHERE year='${d[0]}'
        `;


        sqlSource.setQuery(query);
        selection.year = d[0];
      })
      .on("mouseout", function(d) {
        d3.select(this)
          .transition().duration(300)
          .attr("x", 165)
          .attr("y", yb(d[0]))
          .attr("width", x(d[1]))
          .attr("height", yb.bandwidth()-2);
      });
}



function createMap(baseMap, zipcodes, selection) {

  function projectPoint(x, y) {
    let point = dMap.latLngToLayerPoint(new L.LatLng(y, x));
    this.stream.point(point.x, point.y);
  }

  let projection = d3.geoTransform({point: projectPoint}),
      path       = d3.geoPath().projection(projection),
      svg        = baseMap[0],
      g          = baseMap[1],
      dMap       = baseMap[2];




  let legendControl   = L.control({position: 'topleft'});



  legendControl.onAdd = addLegendToMap;
  legendControl.addTo(dMap);





  dMap.on("zoomend", reproject);
  reproject();



  function addLegendToMap(map) {
    let div    = L.DomUtil.create('div', 'legendbox'),
        ndiv   = d3.select(div)
                   .style("left", "50px")
                   .style("top", "-75px"),
        lsvg   = ndiv.append("svg"),
        legend = lsvg.append("g")
                   .attr("class", "legend")
                   .attr("transform", "translate(0, 20)");
    legend.append("text")
      .attr("class", "axis--map--caption")
      .attr("y", -6);
    return div;
  };





  function reproject() {

		bounds = path.bounds(zipcodes);
    let topLeft     = bounds[0],
        bottomRight = bounds[1];
    svg.attr("width", bottomRight[0] - topLeft[0])
      .attr("height", bottomRight[1] - topLeft[1])
      .style("left", topLeft[0] + "px")
      .style("top", topLeft[1] + "px");


    g.attr("transform", `translate(${-topLeft[0]}, ${-topLeft[1]})`);


    let zipShapes = g.selectAll(".zipcode")
      .data(zipcodes.features);
    zipShapes
      .enter().append("path")
        .attr("class", "zipcode")
      .merge(zipShapes)
        .attr("d", path);


    updateMap(g, selection);
  }
}

function updateMap(g, selection) {
  let data     = selection.data,
      maxCount = d3.max(data, d => d[1]),
      steps    = 5,
      color    = d3.scaleThreshold()
                   .domain(d3.range(0, maxCount, maxCount/steps))
                   .range(d3.schemeBlues[steps])
      zipcodes = g.selectAll(".zipcode")
                   .data(data, d => (d[0]?d[0]:d.properties.zipcode)),
      x        = d3.scaleLinear()
                   .domain([0, maxCount])
                   .rangeRound([50, 300]),
      legend   = d3.select(".legend");

	zipcodes
    .transition().duration(300)
    .style("fill", d => color(d[1]));

  zipcodes.exit()
    .transition().duration(300)
    .style("fill", "none");

  let boxes = legend.selectAll("rect")
    .data(color.range().map(function(a) {
        var d = color.invertExtent(a);
        return [(d[0]!==null?d[0]:x.domain()[0]),
                (d[1]!==null?d[1]:x.domain()[1])];
      }));

  boxes
    .enter().append("rect")
    .merge(boxes)
      .attr("height", 6)
      .attr("x", d => x(d[0]))
      .attr("width", d => (x(d[1]) - x(d[0])))
      .attr("fill", d => color(d[1]));

  legend.call(d3.axisBottom(x)
      .ticks(steps, "s")
      .tickSize(10,0)
      .tickValues(color.domain()))
    .select(".domain")
      .remove();

  legend.select(".axis--map--caption")
    .attr("x", x.range()[0])
    .text(`Number of Heat Complaints in ${selection.year}`);
}

function createBaseMap() {
  let center    = [40.7, -73.975],
      cusp      = [40.692908,-73.9896452]
      baseLight = L.tileLayer('https://cartodb-basemaps-{s}.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png',
                              { maxZoom: 18, }),
      baseDark  = L.tileLayer('https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png',
                              { maxZoom: 18, }),
      circle    = L.circle(cusp, 1000, options={editable: true}),
      dMap      = L.map('map', {
                    center: center,
                    zoom: 13,
                    layers: [baseLight]
                  }),
      svg       = d3.select(dMap.getPanes().overlayPane).append("svg"),
			g         = svg.append("g").attr("class", "leaflet-zoom-hide");

  L.control.layers({
                    "Light": baseLight,
                    "Dark" : baseDark,
                   },
                   {
                    "Selection": circle,
                   }).addTo(dMap);

  let infoBox = L.control({position: 'bottomleft'});
  infoBox.onAdd = function (map) {var div = L.DomUtil.create('div', 'infobox'); return div;}
  infoBox.addTo(dMap);

  return [svg, g, dMap, circle];
}
