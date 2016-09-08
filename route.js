var RouteLoader = function (weatherOwmKey, googleMapJsKey = "") {
    this.route = undefined;
    this.api = {
        weatherOwmKey: weatherOwmKey,
        googleMapJsKey: googleMapJsKey
    };
}

RouteLoader.prototype.loadRouteData = function (routeInfoCallback, weatherCallback, elevationsCallback, mapDataCallback) {
    mapDataCallback();
    elevationsCallback();
    getWeather(this, weatherCallback, routeInfoCallback);
}

RouteLoader.prototype.createRouteFromGpx = function (e) {
    var text, xml, json;

    text = e.target.result;
    xml = parseXml(text);
    if (xml) {
        json = xmlToJson(xml);

        this.route = new Route(),
            trkpts = json.gpx.trk.trkseg.trkpt;
        for (var i = 0; i < trkpts.length; i++) {
            this.route.addCoordinate(parseFloat(trkpts[i]["@attributes"]["lat"]), parseFloat(trkpts[i]["@attributes"]["lon"]));
        }
        this.route.processCoordinates();
        loadAPI(this);
        return this.route;
    } else {
        throw Error("Failed to parse xml file");
    }

    function loadAPI(routeLoader) {
        var script = document.createElement("script");
        script.src = "https://maps.googleapis.com/maps/api/js?callback=initRouteData&key=" + routeLoader.api.googleMapJsKey;
        script.type = "text/javascript";
        document.getElementsByTagName("head")[0].appendChild(script);
    }
}

var Route = function () {
    this.coordinates = [];
    this.sections = [];
    this.elevations = [];
    this.Ed = 0;
    this.Er = 0;
    this.Es = 0;
    this.Ea = 0;
    this.bbox = {
        minLat: 0,
        maxLat: 0,
        minLng: 0,
        maxLng: 0
    };
    this.weather = undefined;
    this.exerciser = undefined;
}

Route.prototype.addCoordinate = function (lat, lng) {
    this.coordinates.push(new Coordinate(lat, lng));
}

Route.prototype.processCoordinates = function () {
    calculateBbox(this);
    createSections(this);

    function calculateBbox(route) {
        for (var i = 0; i < route.coordinates.length; i++) {
            var coordinate = route.coordinates[i];
            if (i === 0) {
                route.bbox.minLat = route.bbox.maxLat = coordinate.lat;
                route.bbox.minLng = route.bbox.maxLng = coordinate.lng;
            } else {
                route.bbox.minLat = Math.min(route.bbox.minLat, coordinate.lat);
                route.bbox.maxLat = Math.max(route.bbox.maxLat, coordinate.lat);
                route.bbox.minLng = Math.min(route.bbox.minLng, coordinate.lng);
                route.bbox.maxLng = Math.max(route.bbox.maxLng, coordinate.lng);
            }
        }
    }

    function createSections(route) {
        for (var i = 1; i < route.coordinates.length; i++) {
            section = new Section(route.coordinates[i - 1], route.coordinates[i]);
            route.sections.push(section);
        }
    }
}

Route.prototype.getCenterCoordinate = function () {
    return new Coordinate((this.bbox.maxLat + this.bbox.minLat) / 2.0, (this.bbox.maxLng + this.bbox.minLng) / 2.0);
}

Route.prototype.processElevations = function () {
    for (var i = 0; i < this.sections.length; i++) {
        var elevationIndex = this.getElevationIndex(i);
        var nextElevationIndex = this.getElevationIndex(i + 1);
        this.sections[i].slope = this.elevations[nextElevationIndex].elevation - this.elevations[elevationIndex].elevation;
        correctDistanceBasedOnSlope(this.sections[i]);
    }

    function correctDistanceBasedOnSlope(section) {
        section.distance = Math.sqrt(section.slope * section.slope + section.distance * section.distance);
    }
}

Route.prototype.getElevationIndex = function (sectionIndex) {
    var sectionToElevation = (this.elevations.length - 1) / this.sections.length;
    return Math.round(sectionToElevation * sectionIndex);
}

Route.prototype.processWeatherExerciser = function () {
    if (this.exerciser.a != 0) {
        var dt = this.exerciser.vr / this.exerciser.a;
        var aTotalDistance = this.exerciser.vr / 2 * dt;
    } else {
        var aTotalDistance = 0;
    }
    var negativeE = 0;
    for (var i = 0; i < this.sections.length; i++) {
        this.sections[i].headwind = this.weather.calculateHeadwind(this.sections[i].angle);
        this.sections[i].crosswind = this.weather.calculateCrosswind(this.sections[i].angle);

        var aSectionDistance = Math.min(this.sections[i].distance, aTotalDistance);
        aTotalDistance -= aSectionDistance;

        var sectionEnergy = this.exerciser.E(this.sections[i], this.weather);
        if (aSectionDistance > 0) {
            var Ea = this.exerciser.Ea(this.sections[i], this.weather, aSectionDistance);
            this.Ea += Ea;
            sectionEnergy += Ea;
        }
        var E = sectionEnergy + negativeE;
        if (E < 0) {
            negativeE = E;
            this.sections[i].E = 0;
        } else {
            negativeE = 0;
            this.sections[i].E = E;
        }

        this.Ed += this.exerciser.Ed(this.sections[i], this.weather);
        this.Er += this.exerciser.Er(this.sections[i], this.weather);
        this.Es += this.exerciser.Es(this.sections[i], this.weather);
    }
}

Route.prototype.getHighways = function () {
    var highways = {};
    var sections = this.sections;
    var coordinates = this.coordinates;
    for (var i = 0; i < sections.length; i++) {
        if ((coordinates[i].highway != null) && (coordinates[i + 1].highway != null)) {
            if (highways[coordinates[i].highway] == null) {
                highways[coordinates[i].highway] = sections[i].distance;
            } else {
                highways[coordinates[i].highway] += sections[i].distance;
            }
        } else {
            if (highways["undefined"] == null) {
                highways["undefined"] = sections[i].distance;
            } else {
                highways["undefined"] += sections[i].distance;
            }
        }
    }
    return highways;
}

Route.prototype.getSurfaces = function () {
    var surfaces = {};
    var sections = this.sections;
    var coordinates = this.coordinates;
    for (var i = 0; i < sections.length; i++) {
        if ((coordinates[i].highway != null) && (coordinates[i + 1].highway != null)) {
            if (surfaces[coordinates[i].surface] == null) {
                surfaces[coordinates[i].surface] = sections[i].distance;
            } else {
                surfaces[coordinates[i].surface] += sections[i].distance;
            }
        } else {
            if (surfaces["undefined"] == null) {
                surfaces["undefined"] = sections[i].distance;
            } else {
                surfaces["undefined"] += sections[i].distance;
            }
        }
    }
    return surfaces;
}

Route.prototype.getDistance = function () {
    var distance = 0.0;
    for (var i = 0; i < this.sections.length; i++) {
        distance += this.sections[i].distance;
    }
    return distance;
}

Route.prototype.getSlope = function () {
    var slope = 0;
    for (var i = 0; i < this.sections.length; i++) {
        slope += this.sections[i].slope;
    }
    return slope;
}

var Section = function (p0, p1) {
    this.distance = calculateDistance(p0, p1);
    this.highway = undefined;
    this.surface = undefined;
    this.headwind = 0;
    this.crosswind = 0;
    this.slope = 0;
    this.P = 0;
    this.lat = degToRad((p0.lat + p1.lat) / 2);
    this.angle = calculateAngleSynchronizedWithWind(p0, p1);

    function calculateDistance(p0, p1) {
        try {
            return calculateVincentysDistance(p0, p1);
        } catch (error) {
            return calculateHarvesineDistance(p0, p1); //Will probably return erroneous value too
        }
    }

    //https://en.wikipedia.org/wiki/Haversine_formula
    function calculateHarvesineDistance(p0, p1, R = 6371008) {
        var dLat = degToRad(p1.lat - p0.lat);
        var dLng = degToRad(p1.lng - p0.lng);
        var a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(degToRad(p0.lat)) * Math.cos(degToRad(p1.lat)) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
        var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        var d = R * c;
        return d;
    }

    //https: //en.wikipedia.org/wiki/Vincenty%27s_formulae
    function calculateVincentysDistance(p0, p1) {
        var a = 6378137,
            b = 6356752.3142,
            f = 1 / 298.257223563;

        var lng0 = degToRad(p0.lng),
            lng1 = degToRad(p1.lng),
            lat0 = degToRad(p0.lat),
            lat1 = degToRad(p1.lat),
            L = lng1 - lng0;

        var tanU1 = (1 - f) * Math.tan(lat0),
            cosU1 = 1 / Math.sqrt((1 + tanU1 * tanU1)),
            sinU1 = tanU1 * cosU1;
        var tanU2 = (1 - f) * Math.tan(lat1),
            cosU2 = 1 / Math.sqrt((1 + tanU2 * tanU2)),
            sinU2 = tanU2 * cosU2;

        var lambda = L,
            iterationsLimit = 100;
        do {
            var sinlambda = Math.sin(lambda),
                coslambda = Math.cos(lambda);
            var sinSqSigma = (cosU2 * sinlambda) * (cosU2 * sinlambda) + (cosU1 * sinU2 - sinU1 * cosU2 * coslambda) * (cosU1 * sinU2 - sinU1 * cosU2 * coslambda);
            var sinSigma = Math.sqrt(sinSqSigma);
            if (sinSigma == 0) {
                return 0;
            }
            var cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * coslambda;
            var sigma = Math.atan2(sinSigma, cosSigma);
            var sinα = cosU1 * cosU2 * sinlambda / sinSigma;
            var cosSqα = 1 - sinα * sinα;
            var cos2SigmaM = cosSigma - 2 * sinU1 * sinU2 / cosSqα;
            if (isNaN(cos2SigmaM)) {
                cos2SigmaM = 0;
            }
            var C = f / 16 * cosSqα * (4 + f * (4 - 3 * cosSqα));
            var lambdaPrime = lambda;
            lambda = L + (1 - C) * f * sinα * (Sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));
        } while (Math.abs(lambda - lambdaPrime) > 1e-12 && --iterationLimit > 0);

        if (iterationLimit == 0) {
            throw new Error("Vincenty's formulae failed to converge");
        }

        var uSq = cosSqα * (a * a - b * b) / (b * b);
        var A = 1 + uSq / 16384 * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
        var B = uSq / 1024 * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
        var dSigma = B * sinSigma * (cos2SigmaM + B / 4 * (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) -
            B / 6 * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)));

        return b * A * (sigma - dSigma);
    }


    //Wind angle starts with 0 at the south and increases clockwise
    function calculateAngleSynchronizedWithWind(p0, p1) {
        var southAngle = (calculateAngle(p0, p1) + Math.PI / 2) * (-1.0);
        while (southAngle < 0.0) {
            southAngle += 2 * Math.PI;
        }
        return southAngle;
    }

    function calculateAngle(p0, p1) {
        var dy = p1.lat - p0.lat,
            dx = p1.lng - p0.lng;
        return Math.atan2(dy, dx);
    }
}

Section.prototype.s = function () {
    return this.slope / this.distance;
}

https: //en.wikipedia.org/wiki/Standard_conditions_for_temperature_and_pressure
    var Weather = function (p = 101325, T = 293.15, humidity = 0.5, windSpeed = 0, windAngle = 0, R = 8.314) {
        this.p = p;
        this.T = T;
        this.phi = humidity;
        this.R = R;
        this.windSpeed = windSpeed;
        this.windAngle = windAngle;
    }

//https://en.wikipedia.org/wiki/Density_of_air
Weather.prototype.rho = function () {
    var Md = 0.028964,
        Mv = 0.018016,
        psat = 6.1078 * Math.pow(10, (7.5 * kelvinToCelsius(this.T)) / (kelvinToCelsius(this.T) + 237.3)) * 100,
        pv = this.phi * psat,
        pd = this.p - pv;
    return (pd * Md + pv * Mv) / (this.R * this.T);
}

//https: //en.wikipedia.org/wiki/Headwind_and_tailwind
Weather.prototype.calculateHeadwind = function (headingAngle) {
    return -Math.cos(this.windAngle - headingAngle) * this.windSpeed;
}
Weather.prototype.calculateCrosswind = function (headingAngle) {
    return Math.sin(this.windAngle - headingAngle) * this.windSpeed;
}

//https://en.wikipedia.org/wiki/Gravity_of_Earth
Weather.prototype.g = function (phi, h) {
    if (h != null) {
        return this.g(phi) - 3.155e-7 * h;
    } else {
        if (phi != null) {
            return 9.7803253359 * (1 + 0.00193185265241 * Math.sin(phi) * Math.sin(phi)) / Math.sqrt(1 - 0.0066943799013 * Math.sin(phi) * Math.sin(phi));
        } else {
            return 9.81
        }
    }
}

//https://en.wikipedia.org/wiki/Bicycle_performance
var Exerciser = function (Cd = 1, A = 0.5, m = 95, eta = 0.9, v = 10, mv = 2 * 2.5, a = 0.5) {
    this.A = A;
    this.Cd = Cd;
    this.m = m;
    this.eta = eta;
    this.vr = v;
    this.mw = mv;
    this.a = a;
}

Exerciser.prototype.Pinitial = function (section, weather) {
    return (this.Pd(section, weather) + this.Pr(section, weather) + this.Ps(section, weather) + this.Pa()) / this.eta;
}
Exerciser.prototype.P = function (section, weather) {
    return (this.Pd(section, weather) + this.Pr(section, weather) + this.Ps(section, weather)) / this.eta;
}
Exerciser.prototype.Pd = function (section, weather) {
    return this.Fd(section, weather) * (this.vr + section.headwind);
}
Exerciser.prototype.Fd = function (section, weather) {
    var va = this.vr + section.headwind;
    return 0.5 * weather.rho() * va * va * this.Cd * this.A;
}
Exerciser.prototype.Pr = function (section, weather, Crr = 0.0045) {
    return this.vr * this.m * weather.g(section.lat, section.slope) * Math.cos(Math.atan(section.s())) * Crr;
}
Exerciser.prototype.Ps = function (section, weather) {
    return this.vr * this.m * weather.g(section.lat, section.slope) * Math.sin(Math.atan(section.s()));
}
Exerciser.prototype.Pa = function () {
    return this.vr * (this.m + this.mw) * this.a;
}
Exerciser.prototype.PToW = function (P, s, vr = this.vr / 2) {
    return (P * s / vr);
}
Exerciser.prototype.Einitial = function (section, weather, aDistance) {
    return this.PToW(this.P(section, weather), section.distance) + this.Ea(section, weather, aDistance);
}
Exerciser.prototype.E = function (section, weather) {
    return this.PToW(this.P(section, weather), section.distance) / this.eta;
}
Exerciser.prototype.Ed = function (section, weather) {
    return this.PToW(this.Pd(section, weather), section.distance) / this.eta;
}
Exerciser.prototype.Er = function (section, weather) {
    return this.PToW(this.Pr(section, weather), section.distance) / this.eta;
}
Exerciser.prototype.Es = function (section, weather) {
    return this.PToW(this.Ps(section, weather), section.distance) / this.eta;
}
Exerciser.prototype.Ea = function (section, weather, aDistance) {
    return this.PToW(this.Pa(section, weather), aDistance) / this.eta;
}

CityCyclist.prototype = new Exerciser();
CityCyclist.prototype.constructor = CityCyclist;
//Values for Cyclist in "Tops" position from "Bicycling Science" (Wilson, 2004)
function CityCyclist() {
    this.Cd = 1.15;
    this.A = 0.632;
};

RacingCyclist.prototype = new Exerciser();
RacingCyclist.prototype.constructor = CityCyclist;
//Values for Cyclist in "Drops" position from "The effect of crosswinds upon time trials" (Kyle,1991)
function RacingCyclist() {
    this.Cd = 0.88;
    this.A = 0.32;
};

Runner.prototype = new Exerciser();
Runner.prototype.constructor = CityCyclist;
//Values based on the data from Penwarden, A.D., P.F. Grigg, and R. Rayment. 1978. Measurement of wind drag on people standing in a wind tunnel. Building Environ. 13: 75-84.
function Runner() {
    this.Cd = 1.27;
    this.A = 0.55;
};


var ChartDrawer = function (width = 500, height = 150) {
    this.width = width;
    this.height = height;
    this.options_fullStacked = {
        isStacked: "percent",
        width: this.width,
        height: this.height,
        legend: {
            position: "bottom"
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
}

ChartDrawer.prototype.createCustomHtmlTooltip = function (name0, value0, unit0, name1, value1, unit1) {
    if (value1 != null) {
        return '<div style="padding:5px 5px 5px 5px; font-family: Arial; font-size: 11px;">' +
            name0 + ': <b>' + value0 + unit0 + '</b>,<br>' + name1 + ': <b>' + value1 + unit1 + '</b>' +
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

ChartDrawer.prototype.plotElevation = function (route, elevationId) {
    var elevator = new google.maps.ElevationService;
    var chartDrawer = this;

    elevator.getElevationAlongPath({
        "path": route.coordinates,
        "samples": 512
    }, plotElevation);




    function plotElevation(elevations, status) {

        var chartDiv = document.getElementById(elevationId);
        if (status !== "OK") {
            chartDiv.innerHTML = "Cannot show elevation: request failed because " +
                status;
            return;
        }
        var chart = new google.visualization.AreaChart(chartDiv);

        var data = new google.visualization.DataTable();
        data.addColumn("number", "Distance [km]");
        data.addColumn("number", "Elevation [m]");
        data.addColumn(chartDrawer.tooltipColumn);
        var distance = route.getDistance();
        for (var i = 0; i < elevations.length; i++) {
            var cumulativeKm = distance * i / (elevations.length - 1) / 1000;
            data.addRow([cumulativeKm, elevations[i].elevation, chartDrawer.createCustomHtmlTooltip("Elevation", elevations[i].elevation.toFixed(2), " m", "Distance", cumulativeKm.toFixed(3), " km")]);
        }

        chart.draw(data, {
            title: "Route elevations",
            width: chartDrawer.width,
            height: chartDrawer.height,
            legend: "none",
            titleY: "Elevation [m]",
            titleX: "Distance [km]",
            tooltip: {
                isHtml: true
            },
            curveType: "function"
        });

        route.elevations = elevations;
        route.processElevations();
    }
}


ChartDrawer.prototype.plotHighways = function (route, highwaysId) {
    var highways = route.getHighways();
    var chartDiv = document.getElementById(highwaysId);
    var chart = new google.visualization.BarChart(chartDiv);
    var highwayNames = [],
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
}

ChartDrawer.prototype.plotSurfaces = function (route, surfacesId) {
    var surfaces = route.getSurfaces();
    var chartDiv = document.getElementById(surfacesId);
    var chart = new google.visualization.BarChart(chartDiv);
    var surfaceNames = [],
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


}

ChartDrawer.prototype.plotHeadwind = function (route, headwindId) {
    var chartDiv = document.getElementById(headwindId);
    var chart = new google.visualization.AreaChart(chartDiv);

    var data = new google.visualization.DataTable();
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
}


ChartDrawer.prototype.plotCrosswind = function (route, crosswindId) {
    var chartDiv = document.getElementById(crosswindId);
    var chart = new google.visualization.AreaChart(chartDiv);

    var data = new google.visualization.DataTable();
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
}


ChartDrawer.prototype.plotKcal = function (route, kcalId) {
    var chartDiv = document.getElementById(kcalId);
    var chart = new google.visualization.AreaChart(chartDiv);

    var data = new google.visualization.DataTable();
    data.addColumn("number", "Distance [km]");
    data.addColumn("number", "kcal");
    data.addColumn(this.tooltipColumn);
    var rows = [];
    var cumulativeDistanceKm = 0;
    var cumulativeEnergyKcal = 0;
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
}


ChartDrawer.prototype.plotE = function (route, PId) {
    var chartDiv = document.getElementById(PId);
    var chart = new google.visualization.BarChart(chartDiv);

    var absoluteE = Math.abs(route.Ed) + Math.abs(route.Ea) + Math.abs(route.Es) + Math.abs(route.Er),
        percEd = 100 * route.Ed / absoluteE,
        percEa = 100 * route.Ea / absoluteE,
        percEs = 100 * route.Es / absoluteE,
        percEr = 100 * route.Er / absoluteE;

    var unit = "%",
        unitDescription = " of total absolute energy";
    var data = google.visualization.arrayToDataTable([
          ["Energy", "kcal", this.tooltipColumn],
          ["Air drag", percEd, this.createCustomHtmlTooltip("Air drag", percEd.toFixed(2), unit, unitDescription)],
          ["Rolling resistance", percEr, this.createCustomHtmlTooltip("Rolling resistance", percEr.toFixed(2), unit, unitDescription)],
          ["Climbing", percEs, this.createCustomHtmlTooltip("Climbing", percEs.toFixed(2), unit, unitDescription)],
          ["Acceleration", percEa, this.createCustomHtmlTooltip("Acceleration", percEa.toFixed(2), unit, unitDescription)]
        ]);
    data.sort([{
        column: 1,
        desc: true
    }]);

    var options = {
        title: "Energy portions",
        legend: "none",
        titleX: "% of absolute energy",
        pieHole: 0.4,
        width: this.width,
        height: this.height,
        tooltip: {
            isHtml: true
        }
    };

    chart.draw(data, options);
}


function radToDeg(radians) {
    return radians * (180 / Math.PI);
}

function degToRad(degrees) {
    return degrees * (Math.PI / 180);
}

function ktphToMps(knots) {
    return kphToMps(ktphToKph(knots));
}

function ktphToKph(knots) {
    return 1.852 * knots;
}

function kphToMps(kph) {
    return kph * 1000 / 3600;
}

function mpsToKph(mps) {
    return mps * 3600 / 1000;
}

function jouleToKcal(joule) {
    return joule / 4184;
}

function kelvinToCelsius(T) {
    return T - 273.15;
}

function selectionSortNamesValuesDesc(names, values) {
    var minIdx, temp;
    for (var i = 0; i < values.length; i++) {
        minIdx = i;
        for (var j = i + 1; j < values.length; j++) {
            if (values[j] > values[minIdx]) {
                minIdx = j;
            }
        }
        temp = values[i];
        values[i] = values[minIdx];
        values[minIdx] = temp;

        temp = names[i];
        names[i] = names[minIdx];
        names[minIdx] = temp;
    }
}

function getWeather(routeLoader, weatherCallback, routeInfoCallback) {
    var route = routeLoader.route,
        centerCoordinate = route.getCenterCoordinate();
    return getResponse("http://api.openweathermap.org/data/2.5/weather?lat=" + centerCoordinate.lat + "&lon=" + centerCoordinate.lng + "&APPID=" + routeLoader.api.weatherOwmKey, "json",
        function (error, data) {
            if (error != null) {
                weatherCallback(error);
            } else {
                try {
                    var windSpeed = ktphToMps(data["wind"]["speed"]),
                        windAngle = degToRad(data["wind"]["deg"]),
                        temperature = data["main"]["temp"],
                        pressure = data["main"]["pressure"] * 100,
                        humidity = data["main"]["humidity"] / 100;
                    route.weather = new Weather(pressure, temperature, humidity, windSpeed, windAngle);
                    route.exerciser = new CityCyclist();
                    route.processWeatherExerciser();
                    weatherCallback(null, data);
                } catch (error) {
                    route.weather = new Weather();
                    weatherCallback(error, data);
                }

                getRouteInfo(route, routeInfoCallback);
            }
        });
}

function getRouteInfo(route, routeInfoCallback) {
    return getResponse("http://overpass.osm.rambler.ru/cgi/xapi?way[bbox=" + route.bbox.minLng + "," + route.bbox.minLat + "," + route.bbox.maxLng + "," + route.bbox.maxLat + "][highway=*]", "document",
        function (error, data) {
            if (error != null) {
                routeInfoCallback(error);
            } else {
                try {
                    roadsInfoJson = xmlToJson(data);
                    var coordinates = route.coordinates;
                    for (var i = 0; i < coordinates.length; i++) {
                        coordinates[i].loadOsmRoadInfo(roadsInfoJson);
                    }
                    routeInfoCallback(null, data);
                } catch (error) {
                    routeInfoCallback(error, data);
                }
            }
        });
}

var getResponse = function (url, responseType, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open("get", url, true);
    xhr.responseType = responseType;
    xhr.onload = function () {
        var status = xhr.status;
        if (status == 200) {
            callback(null, xhr.response);
        } else {
            callback(status);
        }
    };
    xhr.send();
};
