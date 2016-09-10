var RouteLoader = function (weatherOwmKey, googleMapJsKey = "") {
    this.route = undefined;
    this.api = {
        weatherOwmKey: weatherOwmKey,
        googleMapJsKey: googleMapJsKey
    };
}

RouteLoader.prototype.createRouteFromGpx = function (e) {
    var text = e.target.result;
    var xml = parseXml(text);
    if (xml) {
        var json = xmlToJson(xml);
        this.route = new Route(),
            trkpts = json.gpx.trk.trkseg.trkpt;
        for (var i = 0; i < trkpts.length; i++) {
            this.route.addCoordinate(parseFloat(trkpts[i]["@attributes"]["lat"]), parseFloat(trkpts[i]["@attributes"]["lon"]));
        }
        this.route.processCoordinates();
        return this.route;
    } else {
        throw Error("Failed to parse xml file");
    }


}

RouteLoader.prototype.loadApi = function () {
    var script = document.createElement("script");
    script.src = "https://maps.googleapis.com/maps/api/js?callback=initRouteData&key=" + this.api.googleMapJsKey;
    script.type = "text/javascript";
    document.getElementsByTagName("head")[0].appendChild(script);
}

RouteLoader.prototype.loadRouteData = function (weatherCallback, routeInfoCallback, elevationsCallback, mapDataCallback) {
    mapDataCallback();
    this.loadElevations(elevationsCallback);
    this.getRouteInfo(routeInfoCallback);
    this.getWeather(weatherCallback);
    console.log(this.route);
    return this.route;
}

RouteLoader.prototype.loadElevations = function (elevationsCallback) {
    var elevator = new google.maps.ElevationService;
    var route = this.route;

    elevator.getElevationAlongPath({
        "path": route.coordinates,
        "samples": 512
    }, processElevations);

    function processElevations(elevations, status) {
        if (status !== "OK") {
            elevationsCallback(status);
        } else {
            route.elevations = elevations;
            route.processElevations();
            elevationsCallback();
        }
    }
}

RouteLoader.prototype.getRouteInfo = function (routeInfoCallback) {
    var route = this.route;
    return getResponse("http://overpass.osm.rambler.ru/cgi/xapi?way[bbox=" + route.bbox.minLng + "," + route.bbox.minLat + "," + route.bbox.maxLng + "," + route.bbox.maxLat +
        "][highway=*]", "document",
        function (error, data) {
            if (error != null) {
                routeInfoCallback(error);
            } else {
                try {
                    roadsInfoJson = xmlToJson(data);
                    route.processOsmData(roadsInfoJson);
                    routeInfoCallback(null, data);
                } catch (error) {
                    routeInfoCallback(error, data);
                }
            }
        });
}

RouteLoader.prototype.getWeather = function (weatherCallback) {
    var routeLoader = this,
        centerCoordinate = this.route.getCenterCoordinate();
    return getResponse("http://api.openweathermap.org/data/2.5/weather?lat=" + centerCoordinate.lat + "&lon=" + centerCoordinate.lng + "&APPID=" + routeLoader.api.weatherOwmKey,
        "json",
        function (error, data) {
            if (error != null) {
                this.route.weather = new Weather();
                weatherCallback(error, data);
            } else {
                try {
                    var windSpeed = ktphToMps(data["wind"]["speed"]),
                        windAngle = degToRad(data["wind"]["deg"]),
                        temperature = data["main"]["temp"],
                        pressure = data["main"]["pressure"] * 100,
                        humidity = data["main"]["humidity"] / 100;
                    routeLoader.route.weather = new Weather(pressure, temperature, humidity, windSpeed, windAngle);
                    routeLoader.route.exerciser = new CityCyclist();
                    routeLoader.route.processWeatherExerciser();
                    weatherCallback(null, data);
                } catch (error) {
                    routeLoader.route.weather = new Weather();
                    weatherCallback(error, data);
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
    var top = latToMercatorY(this.bbox.maxLat);
    var bottom = latToMercatorY(this.bbox.minLat);
    var vCenter = gudermannian((top + bottom) / 2);
    return new Coordinate(radToDeg(vCenter), (this.bbox.maxLng + this.bbox.minLng) / 2.0);
}

//http://mathworld.wolfram.com/MercatorProjection.html
Route.prototype.getMercatorCenterCoordinate = function () {
    var top = latToMercatorY(this.bbox.maxLat);
    var bottom = latToMercatorY(this.bbox.minLat);
    var vCenter = gudermannian((top + bottom) / 2);
    return new Coordinate(radToDeg(vCenter), (this.bbox.maxLng + this.bbox.minLng) / 2.0);
}

function latToMercatorY(latDeg) {
    var sinY = Math.sin(degToRad(latDeg));
    return Math.log((1 + sinY) / (1 - sinY)) / 2;
}

function gudermannian(y) {
    return Math.atan(Math.sinh(y));
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

Route.prototype.getElevationCoordinate = function (elevationIndex) {
    var elevationToCoordinate = (this.coordinates.length - 1) / this.elevations.length;
    return Math.round(elevationToCoordinate * elevationIndex);
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

Route.prototype.processOsmData = function (roadsInfoJson) {
    for (var i = 0; i < this.coordinates.length; i++) {
        this.coordinates[i].loadOsmRoadInfo(roadsInfoJson);
    }
    for (var i = 0; i < this.sections.length; i++) {
        if ((this.coordinates[i].highway != null) && (this.coordinates[i + 1].highway != null)) {
            this.sections[i].highway = this.coordinates[i].highway;
            this.sections[i].surface = this.coordinates[i].surface;
        }
    }
}

Route.prototype.getHighways = function () {
    var highways = {};
    var sections = this.sections;
    var coordinates = this.coordinates;
    for (var i = 0; i < sections.length; i++) {
        if (sections[i].highway != null) {
            if (highways[sections[i].highway] == null) {
                highways[sections[i].highway] = sections[i].distance;
            } else {
                highways[sections[i].highway] += sections[i].distance;
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
        if (sections[i].highway != null) {
            if (surfaces[sections[i].surface] == null) {
                surfaces[sections[i].surface] = sections[i].distance;
            } else {
                surfaces[sections[i].surface] += sections[i].distance;
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

//https://en.wikipedia.org/wiki/Mercator_projection
Route.prototype.getGoogleMapZoom = function (mapWidth, mapHeight) {
    var GMAP_BASE_DIM = {
        height: 256,
        width: 256
    };
    var ZOOM_MAX = 21;

    var lngFraction = (this.bbox.maxLng - this.bbox.minLng) / 360;
    var latFraction = (latToMercatorY(this.bbox.maxLat) - latToMercatorY(this.bbox.minLat)) / (2 * Math.PI);

    var lngZoom = zoom(mapWidth, GMAP_BASE_DIM.width, lngFraction);
    var latZoom = zoom(mapHeight, GMAP_BASE_DIM.height, latFraction);

    return Math.min(latZoom, lngZoom, ZOOM_MAX);

    function zoom(mapPx, worldPx, fraction) {
        return Math.floor(Math.log(mapPx / worldPx / fraction) / Math.LN2);
    }
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

//https: //en.wikipedia.org/wiki/Standard_conditions_for_temperature_and_pressure
var Weather = function (p = 101325, T = 293.15, humidity = 0.5, windSpeed = 0, windAngle = 0, R = 8.314) {
    this.p = p;
    this.T = T;
    this.phi = humidity;
    this.R = R;
    this.windSpeed = windSpeed;
    this.windAngle = windAngle;
}

//e.g. north wind is from north to south
Weather.prototype.getWindDirection = function () {
    var directionIndex = Math.round((angle / (Math.PI / 8))) % 16;
    directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
    return directions[directionIndex]
}

//https://en.wikipedia.org/wiki/Beaufort_scale
Weather.prototype.getBeaufortNumber = function () {
    return Math.round(Math.pow(windSpeed / 0.836, 2 / 3));
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
Exerciser.prototype.Pr = function (section, weather) {
    return this.vr * this.m * weather.g(section.lat, section.slope) * Math.cos(Math.atan(section.s())) * this.Crr(section);
}

//Based on http://www.engineeringtoolbox.com/rolling-friction-resistance-d_1303.html; 9th Conference of the International Sports Engineering Association (ISEA), Cycling comfort on different road surfaces, Christin Hölzela*, Franz Höchtla, Veit Sennera; http://wiki.openstreetmap.org/wiki/Key:surface
Exerciser.prototype.Crr = function (section) {
    var speedCorrection = 1 + this.vr / 20;
    return sectionCrr(section) * speedCorrection;

    function sectionCrr(section) {
        switch (section.surface) {
            case "wood":
            case "tartan":
            case "clay":
            case "metal":
                return 0.001;
            case "concrete":
                return 0.002;
            case "paved":
            case "paving_stones":
            case "paving_stones:30":
            case "concrete:lanes":
            case "concrete:plates":
                return 0.003;
            case "asphalt":
                return 0.004;
            case "solid":
            case "sett":
            default:
                return 0.0045;
            case "mostly solid":
            case "grass_paver":
            case "fine_gravel":
                return 0.005;
            case "even mixture of hard and soft materials":
                return 0.006;
            case "mostly soft":
            case "cobblestone":
                return 0.007;
            case "soft":
            case "sand":
            case "compacted":
            case "pebblestone":
                return 0.008;
            case null:
            case "unpaved":
            case "other":
            case "gravel":
            case "earth":
                return 0.009;
            case "grass":
            case "dirt":
                return 0.01;
            case "mud":
                return 0.015;
        }
    }
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
    this.eta = 0.8;
    this.vr = kphToMps(20);
    this.a = 0.5;
};

RacingCyclist.prototype = new Exerciser();
RacingCyclist.prototype.constructor = CityCyclist;
//Values for Cyclist in "Drops" position from "The effect of crosswinds upon time trials" (Kyle,1991)
function RacingCyclist() {
    this.Cd = 0.88;
    this.A = 0.32;
    this.eta = 0.95;
    this.vr = kphToMps(30);
    this.a = 1.5;
};

Runner.prototype = new Exerciser();
Runner.prototype.constructor = CityCyclist;
//Values based on the data from Penwarden, A.D., P.F. Grigg, and R. Rayment. 1978. Measurement of wind drag on people standing in a wind tunnel. Building Environ. 13: 75-84.
function Runner() {
    this.Cd = 1.27;
    this.A = 0.55;
};


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

ChartDrawer.prototype.plotElevation = function (elevationId) {
    var route = this.route,
        gMap = this.gMap,
        elevations = route.elevations,
        chartDiv = document.getElementById(elevationId),
        chart = new google.visualization.AreaChart(chartDiv),
        data = new google.visualization.DataTable();
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
            strokeColor: '#00FF00',
            strokeOpacity: 1.0,
            strokeWeight: 5
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
                    strokeColor: '#00FF00',
                    strokeOpacity: 1.0,
                    strokeWeight: 5
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
                    strokeColor: '#00FF00',
                    strokeOpacity: 1.0,
                    strokeWeight: 5
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
        data = new google.visualization.DataTable();
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
            strokeColor: '#00FF00',
            strokeOpacity: 1.0,
            strokeWeight: 5
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
        data = new google.visualization.DataTable();
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
            strokeColor: '#00FF00',
            strokeOpacity: 1.0,
            strokeWeight: 5
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
        data = new google.visualization.DataTable();
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
            strokeColor: '#00FF00',
            strokeOpacity: 1.0,
            strokeWeight: 5
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

        absoluteE = Math.abs(this.route.Ed) + Math.abs(this.route.Ea) + Math.abs(this.route.Es) + Math.abs(this.route.Er),
        percEd = 100 * this.route.Ed / absoluteE,
        percEa = 100 * this.route.Ea / absoluteE,
        percEs = 100 * this.route.Es / absoluteE,
        percEr = 100 * this.route.Er / absoluteE,

        unit = "%",
        unitDescription = " of total absolute energy",

        data = google.visualization.arrayToDataTable([
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
