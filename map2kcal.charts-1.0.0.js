/* 
 * Copyright 2016 Damian Terlecki.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

(function () {
    var script = document.createElement("script");
    script.src = "https://www.gstatic.com/charts/loader.js";
    script.type = "text/javascript";

    script.onload = function () {
        google.charts.load("current", {
            packages: ["corechart"]
        });
    }
    document.getElementsByTagName("head")[0].appendChild(script);
})();

var ChartDrawer = function (width = 500, height = 150, route, gMap) {
    this.width = width;
    this.height = height;
    this.options_fullStacked = {
        isStacked: "percent",
        width: this.width,
        height: this.height,
        legend: {
            position: "bottom",
            alignment: "start"
        },
        hAxis: {
            minValue: 0,
            ticks: [0, .3, .6, .9, 1]
        },
        tooltip: {
            isHtml: true
        }
    };
    this.tooltipColumn = {
        "type": "string",
        "role": "tooltip",
        "p": {
            "html": true
        }
    };
    this.gMap = gMap;
    this.route = route;
    this.strokeColor = '#FFFF00';
    this.strokeOpacity = 1.0;
    this.strokeWeight = 5;
    this.zIndex = 200;
}

ChartDrawer.prototype.createCustomHtmlTooltip = function (name0, value0, unit0, name1, value1, unit1) {
    if (value1 != null) {
        return '<div style="padding:5px 5px 5px 5px; font-family: Arial; font-size: 11px;">' +
            name0 + ': <b>' + value0 + unit0 + '</b>, <br>' + name1 + ': <b>' + value1 + unit1 + '</b>' +
            '</div>';
    } else {
        if (name1 != null) {
            return '<div style="padding:5px 5px 5px 5px; font-family: Arial; font-size: 11px;">' +
                name0 + ': <b>' + value0 + unit0 + '</b> ' + name1;
        } else {
            if (unit0 != null) {
                return '<div style="padding:5px 5px 5px 5px; font-family: Arial; font-size: 11px;">' +
                    name0 + ': <b>' + value0 + unit0 + '</b>';
            } else {
                return '<div style="padding:5px 5px 5px 5px; font-family: Arial; font-size: 11px;">' +
                    name0 + ': <b>' + value0 + '</b>';
            }
        }
    }
}

ChartDrawer.prototype.plotElevation = function (elevationId) {
    var route = this.route,
        gMap = this.gMap,
        elevations = route.elevations,
        chartDiv = document.getElementById(elevationId),
        chart = new google.visualization.AreaChart(chartDiv),
        data = new google.visualization.DataTable(),
        chartDrawer = this;
    data.addColumn("number", "Distance [km]");
    data.addColumn("number", "Elevation [m]");
    data.addColumn(this.tooltipColumn);
    var distance = route.getDistance();
    for (var i = 0; i < elevations.length; i++) {
        var cumulativeKm = distance * i / (elevations.length - 1) / 1000;
        data.addRow([cumulativeKm, elevations[i].elevation, this.createCustomHtmlTooltip("Elevation", elevations[i].elevation.toFixed(2), " m", "Distance", cumulativeKm.toFixed(3), " km")]);
    }

    chart.draw(data, {
        title: "Route elevations",
        width: this.width,
        height: this.height,
        legend: "none",
        titleY: "Elevation [m]",
        titleX: "Distance [km]",
        tooltip: {
            isHtml: true
        },
        curveType: "function"
    });

    if (gMap != null) {
        var dot;
        google.visualization.events.addListener(chart, 'onmouseover', mouseoverHandler);
        google.visualization.events.addListener(chart, 'onmouseout', mouseoutHandler);
    }

    function mouseoverHandler(event) {
        var coordinate = route.coordinates[route.getElevationCoordinate(event.row)];
        dot = new google.maps.Polyline({
            path: [coordinate, coordinate],
            geodesic: true,
            strokeColor: chartDrawer.strokeColor,
            strokeOpacity: chartDrawer.strokeOpacity,
            strokeWeight: chartDrawer.strokeWeight * 2,
            zIndex: chartDrawer.zIndex
        });
        dot.setMap(gMap);
    }

    function mouseoutHandler(event) {
        dot.setMap(null);
        dot = undefined;
    }
}

ChartDrawer.prototype.plotHighways = function (highwaysId) {
    var route = this.route,
        gMap = this.gMap,
        highways = route.getHighways(),
        chartDiv = document.getElementById(highwaysId),
        chart = new google.visualization.BarChart(chartDiv),
        chartDrawer = this,

        highwayNames = [],
        highwayPercentages = [],
        highwayTooltips = [];
    for (var highwayName in highways) {
        highwayNames.push(highwayName);
        highwayPercentages.push(highways[highwayName]);
    }
    selectionSortNamesValuesDesc(highwayNames, highwayPercentages);
    for (var i = 0; i < highwayNames.length; i++) {
        highwayTooltips.push(this.createCustomHtmlTooltip("Higway type", highwayNames[i]));
    }

    var data = new google.visualization.DataTable();
    data.addColumn("string", "Highway type");
    var row = ["Highway"];
    for (var i = 0; i < highwayTooltips.length; i++) {
        data.addColumn("number", highwayNames[i]);
        row.push(highwayPercentages[i]);
        data.addColumn(this.tooltipColumn);
        row.push(highwayTooltips[i]);
    }
    data.addRows([row]);

    var view = new google.visualization.DataView(data);

    this.options_fullStacked.title = "Highway types en route";
    chart.draw(view, this.options_fullStacked);

    if (gMap != null) {
        var lines;
        google.visualization.events.addListener(chart, 'onmouseover', mouseoverHandler);
        google.visualization.events.addListener(chart, 'onmouseout', mouseoutHandler);
    }

    function mouseoverHandler(event) {
        lines = [];
        var index = parseInt(event.column / 2);
        var highwayName = highwayNames[index];
        if (highwayName == "undefined") {
            highwayName = null;
        }
        for (var i = 0; i < route.sections.length; i++) {
            if (route.sections[i].highway == highwayName) {
                var line = new google.maps.Polyline({
                    path: [route.coordinates[i], route.coordinates[i + 1]],
                    geodesic: true,
                    strokeColor: chartDrawer.strokeColor,
                    strokeOpacity: chartDrawer.strokeOpacity,
                    strokeWeight: chartDrawer.strokeWeight,
                    zIndex: chartDrawer.zIndex
                });
                line.setMap(gMap);
                lines.push(line);
            }
        }

    }

    function mouseoutHandler(event) {
        for (var i = 0; i < lines.length; i++) {
            lines[i].setMap(null);
        }
        lines = undefined;
    }

}

ChartDrawer.prototype.plotSurfaces = function (surfacesId) {
    var route = this.route,
        gMap = this.gMap,
        surfaces = route.getSurfaces(),
        chartDiv = document.getElementById(surfacesId),
        chart = new google.visualization.BarChart(chartDiv),
        chartDrawer = this,

        surfaceNames = [],
        surfacePercentages = [],
        surfaceTooltips = [];
    for (var surfaceName in surfaces) {
        surfaceNames.push(surfaceName);
        surfacePercentages.push(surfaces[surfaceName]);
    }
    selectionSortNamesValuesDesc(surfaceNames, surfacePercentages);
    for (var i = 0; i < surfaceNames.length; i++) {
        surfaceTooltips.push(this.createCustomHtmlTooltip("Surface type", surfaceNames[i]));
    }
    var data = new google.visualization.DataTable();
    data.addColumn("string", "Surface type");
    var row = ["Surface"];
    for (var i = 0; i < surfaceTooltips.length; i++) {
        data.addColumn("number", surfaceNames[i]);
        row.push(surfacePercentages[i]);
        data.addColumn(this.tooltipColumn);
        row.push(surfaceTooltips[i]);
    }
    data.addRows([row]);

    var view = new google.visualization.DataView(data);

    this.options_fullStacked.title = "Surface types en route";
    chart.draw(view, this.options_fullStacked);

    if (gMap != null) {
        var lines;
        google.visualization.events.addListener(chart, 'onmouseover', mouseoverHandler);
        google.visualization.events.addListener(chart, 'onmouseout', mouseoutHandler);
    }

    function mouseoverHandler(event) {
        lines = [];
        var index = parseInt(event.column / 2);
        var surfaceName = surfaceNames[index];
        if (surfaceName == "undefined") {
            surfaceName = null;
        }
        for (var i = 0; i < route.sections.length; i++) {
            if (route.sections[i].surface == surfaceName) {
                var line = new google.maps.Polyline({
                    path: [route.coordinates[i], route.coordinates[i + 1]],
                    geodesic: true,
                    strokeColor: chartDrawer.strokeColor,
                    strokeOpacity: chartDrawer.strokeOpacity,
                    strokeWeight: chartDrawer.strokeWeight,
                    zIndex: chartDrawer.zIndex
                });
                line.setMap(gMap);
                lines.push(line);
            }
        }

    }

    function mouseoutHandler(event) {
        for (var i = 0; i < lines.length; i++) {
            lines[i].setMap(null);
        }
        lines = undefined;
    }

}

ChartDrawer.prototype.plotHeadwind = function (headwindId) {
    var route = this.route,
        gMap = this.gMap,
        chartDiv = document.getElementById(headwindId),
        chart = new google.visualization.AreaChart(chartDiv),
        data = new google.visualization.DataTable(),
        chartDrawer = this;
    data.addColumn("number", "Distance [km]");
    data.addColumn("number", "Headwind (positive) [km/h]");
    data.addColumn(this.tooltipColumn);
    data.addColumn("number", "Headwind (negative) [km/h]");
    data.addColumn(this.tooltipColumn);
    var cumulativeDistanceKm = 0;
    for (var i = 0; i < route.sections.length; i++) {
        cumulativeDistanceKm += route.sections[i].distance / 1000;
        var headwind = mpsToKph(route.sections[i].headwind);
        var tooltip = this.createCustomHtmlTooltip("Headwind", headwind.toFixed(2), " km/h", "Distance", cumulativeDistanceKm.toFixed(3), " km");
        if (headwind > 0) {
            data.addRow([cumulativeDistanceKm, headwind, tooltip, null, null]);
        } else {
            data.addRow([cumulativeDistanceKm, null, null, headwind, tooltip]);
        }
    }

    chart.draw(data, {
        title: "Headwind",
        width: this.width,
        height: this.height,
        legend: "none",
        titleY: "Headwind [km/h]",
        titleX: "Distance [km]",
        tooltip: {
            isHtml: true
        },
        curveType: "function",
        colors: ["red", "green"]
    });

    if (gMap != null) {
        var line;
        google.visualization.events.addListener(chart, 'onmouseover', mouseoverHandler);
        google.visualization.events.addListener(chart, 'onmouseout', mouseoutHandler);
    }

    function mouseoverHandler(event) {
        line = new google.maps.Polyline({
            path: [route.coordinates[event.row], route.coordinates[event.row + 1]],
            geodesic: true,
            strokeColor: chartDrawer.strokeColor,
            strokeOpacity: chartDrawer.strokeOpacity,
            strokeWeight: chartDrawer.strokeWeight,
            zIndex: chartDrawer.zIndex
        });
        line.setMap(gMap);
    }

    function mouseoutHandler(event) {
        line.setMap(null);
        line = undefined;
    }
}


ChartDrawer.prototype.plotCrosswind = function (crosswindId) {
    var route = this.route,
        gMap = this.gMap,
        chartDiv = document.getElementById(crosswindId),
        chart = new google.visualization.AreaChart(chartDiv),
        data = new google.visualization.DataTable(),
        chartDrawer = this;
    data.addColumn("number", "Distance [km]");
    data.addColumn("number", "Crosswind (from left) [km/h]");
    data.addColumn(this.tooltipColumn);
    data.addColumn("number", "Crosswind (from right) [km/h]");
    data.addColumn(this.tooltipColumn);
    var cumulativeDistanceKm = 0;
    for (var i = 0; i < route.sections.length; i++) {
        cumulativeDistanceKm += route.sections[i].distance / 1000;
        var crosswind = mpsToKph(route.sections[i].crosswind);
        if (crosswind > 0) {
            var tooltip = this.createCustomHtmlTooltip("Crosswind (from left)", crosswind.toFixed(2), " km/h", "Distance", cumulativeDistanceKm.toFixed(3), " km");
            data.addRow([cumulativeDistanceKm, crosswind, tooltip, null, null]);
        } else {
            var tooltip = this.createCustomHtmlTooltip("Crosswind (from right)", crosswind.toFixed(2), " km/h", "Distance", cumulativeDistanceKm.toFixed(3), " km");
            data.addRow([cumulativeDistanceKm, null, null, crosswind, tooltip]);
        }
    }

    var formatter = new google.visualization.ArrowFormat();
    formatter.format(data, 1);

    chart.draw(data, {
        title: "Crosswind",
        width: this.width,
        height: this.height,
        legend: "none",
        titleY: "Crosswind [km/h]",
        titleX: "Distance [km]",
        tooltip: {
            isHtml: true
        },
        curveType: "function",
        colors: ["orange", "purple"]
    });

    if (gMap != null) {
        var line;
        google.visualization.events.addListener(chart, 'onmouseover', mouseoverHandler);
        google.visualization.events.addListener(chart, 'onmouseout', mouseoutHandler);
    }

    function mouseoverHandler(event) {
        line = new google.maps.Polyline({
            path: [route.coordinates[event.row], route.coordinates[event.row + 1]],
            geodesic: true,
            strokeColor: chartDrawer.strokeColor,
            strokeOpacity: chartDrawer.strokeOpacity,
            strokeWeight: chartDrawer.strokeWeight,
            zIndex: chartDrawer.zIndex
        });
        line.setMap(gMap);
    }

    function mouseoutHandler(event) {
        line.setMap(null);
        line = undefined;
    }
}


ChartDrawer.prototype.plotKcal = function (kcalId) {
    var route = this.route,
        gMap = this.gMap,
        chartDiv = document.getElementById(kcalId),
        chart = new google.visualization.AreaChart(chartDiv),
        data = new google.visualization.DataTable(),
        chartDrawer = this;
    data.addColumn("number", "Distance [km]");
    data.addColumn("number", "kcal");
    data.addColumn(this.tooltipColumn);
    var rows = [],
        cumulativeDistanceKm = 0,
        cumulativeEnergyKcal = 0;
    rows.push([0, 0, this.createCustomHtmlTooltip("Energy", "0", " kcal", "Distance", "0", " km/h")]);
    for (var i = 0; i < route.sections.length; i++) {
        cumulativeDistanceKm += route.sections[i].distance / 1000;
        cumulativeEnergyKcal += jouleToKcal(route.sections[i].E);
        rows.push([cumulativeDistanceKm, cumulativeEnergyKcal, this.createCustomHtmlTooltip("Energy", cumulativeEnergyKcal.toFixed(3), " kcal", "Distance", cumulativeDistanceKm.toFixed(3), " km")]);
    }

    data.addRows(rows);

    var options = {
        title: "Energy depletion",
        legend: "none",
        titleX: "Distance [km]",
        titleY: "Cumulative energy [kcal]",
        width: this.width,
        height: this.height,
        tooltip: {
            isHtml: true
        }
    };

    chart.draw(data, options);

    if (gMap != null) {
        var subRoute;
        google.visualization.events.addListener(chart, 'onmouseover', mouseoverHandler);
        google.visualization.events.addListener(chart, 'onmouseout', mouseoutHandler);
    }

    function mouseoverHandler(event) {
        var lines = [],
            lastCoordinateIndex = event.row + 1;

        for (var i = 0; i <= lastCoordinateIndex; i++) {
            lines.push(route.coordinates[i]);
        }
        subRoute = new google.maps.Polyline({
            path: lines,
            geodesic: true,
            strokeColor: chartDrawer.strokeColor,
            strokeOpacity: chartDrawer.strokeOpacity,
            strokeWeight: chartDrawer.strokeWeight,
            zIndex: chartDrawer.zIndex
        });
        subRoute.setMap(gMap);
    }

    function mouseoutHandler(event) {
        subRoute.setMap(null);
        subRoute = undefined;
    }
}


ChartDrawer.prototype.plotE = function (PId) {
    var chartDiv = document.getElementById(PId),
        chart = new google.visualization.BarChart(chartDiv),

        absoluteE = Math.abs(this.route.energy.Ed) + Math.abs(this.route.energy.Ea) + Math.abs(this.route.energy.Es) + Math.abs(this.route.energy.Er),
        percEd = 100 * this.route.energy.Ed / absoluteE,
        percEa = 100 * this.route.energy.Ea / absoluteE,
        percEs = 100 * this.route.energy.Es / absoluteE,
        percEr = 100 * this.route.energy.Er / absoluteE,

        unit = "%",
        unitDescription = " of total absolute energy",

        data = google.visualization.arrayToDataTable([
          ["Energy", "kcal", this.tooltipColumn, {
                role: 'style'
            }],
          ["Air drag", percEd, this.createCustomHtmlTooltip("Air drag", percEd.toFixed(2), unit + unitDescription, "Air drag energy", jouleToKcal(this.route.energy.Ed).toFixed(3), " kcal"), ''],
          [this.route.exercise.name, percEr, this.createCustomHtmlTooltip(this.route.exercise.name, percEr.toFixed(2), unit + unitDescription, this.route.exercise.name + " energy", jouleToKcal(this.route.energy.Er).toFixed(3), " kcal"), ''],
          ["Climbing", percEs, this.createCustomHtmlTooltip("Climbing", percEs.toFixed(2), unit + unitDescription, "Climbing energy", jouleToKcal(this.route.energy.Es).toFixed(3), " kcal"), ''],
          ["Acceleration", percEa, this.createCustomHtmlTooltip("Acceleration", percEa.toFixed(2), unit + unitDescription, "Acceleration energy", jouleToKcal(this.route.energy.Ea).toFixed(3), " kcal"), '']
        ]);
    data.sort([{
        column: 1,
        desc: true
    }]);

    data.setCell(0, 3, "red");
    data.setCell(1, 3, "orange");
    data.setCell(2, 3, "yellow");
    if (percEr > 0) {
        data.setCell(3, 3, "green");
    } else {
        data.setCell(3, 3, "blue");
    }

    var options = {
        title: "Energy portions",
        legend: "none",
        titleX: "% of total absolute energy",
        pieHole: 0.4,
        width: this.width,
        height: this.height,
        tooltip: {
            isHtml: true
        }
    };

    chart.draw(data, options);
}

function selectionSortNamesValuesDesc(names, values) {
    for (var i = 0; i < values.length; i++) {
        var minIdx = i;
        for (var j = i + 1; j < values.length; j++) {
            if (values[j] > values[minIdx]) {
                minIdx = j;
            }
        }
        var temp = values[i];
        values[i] = values[minIdx];
        values[minIdx] = temp;

        temp = names[i];
        names[i] = names[minIdx];
        names[minIdx] = temp;
    }
}
