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

var RouteLoader = function (weatherOwmKey, googleMapJsKey = "") {
    this.route = undefined;
    this.api = {
        weatherOwmKey: weatherOwmKey,
        googleMapJsKey: googleMapJsKey
    };
    this.osmMaxDAngleSquare = 3 * 3;
    this.loadedModules = {
        loadingCallback: false,
        map: true,
        elevations: undefined,
        routeInfo: undefined,
        weather: undefined
    };
    this.onLoadingFinished = undefined;
    this.weatherCallback = undefined;
    this.routeInfoCallback = undefined;
    this.elevationsCallback = undefined;
    this.mapCallback = undefined;
}

RouteLoader.prototype.getLicenses = function () {
    return {
        GoogleChart: "Read more at: https://developers.google.com/chart/terms",
        GoogleMaps: "Read more at: https://developers.google.com/maps/terms",
        OpenStreetMap: "The data is made available under ODbL. http://opendatacommons.org/licenses/odbl./",
        OpenWeatherMap: "OpenWeatherMap data is released under the terms and conditions of CC-BY-SA. Read more at: https://openweathermap.org/terms and https://openweathermap.desk.com/customer/portal/questions/14410510-question-about-licensing?t=535697",
        OverpassAPI: "No formal policy yet. Read more at https://wiki.openstreetmap.org/wiki/Talk:Overpass_API#Licensing",
        map2kcal: "Licensed under the Apache License, Version 2.0. Read more at: https://github.com/T3r1jj/map2kcal"
    };
}
RouteLoader.prototype.getAttributions = function () {
    return {
        GoogleChart: [
            "Chart tools ©2015 Google",
            "//developers.google.com/chart/"
        ],
        GoogleMaps: [
            "Map and elevations data ©2015 Google",
            "//www.google.pl/maps"
        ],
        OpenStreetMap: [
            "Route highway/surface types data © OpenStreetMap contributors",
            "//openstreetmap.org/copyright"
        ],
        OpenWeatherMap: [
            "Weather data OpenWeatherMap.org",
            "//openweathermap.org/terms"
        ],
        OverpassAPI: [
            "Overpass API",
            "//overpass-api.de/"
        ],
        map2kcal: [
            "map2kcal",
            "//github.com/T3r1jj/map2kcal"
        ]
    }
}

RouteLoader.prototype.finishLoadingModule = function (loadedModule, errorStatus) {
    if (errorStatus == null) {
        this.loaded[loadedModule] = true;
    } else {
        this.loaded[loadedModule] = errorStatus;
    }
    if (this.loaded["loadingCallback"]) {
        return true;
    }
    for (key in this.loaded) {
        if (this.loaded.hasOwnProperty(key) && key != "loadingCallback") {
            if (this.loaded[key] == null) {
                return false;
            }
        }
    }
    this.loaded["loadingCallback"] = true;
    this.loadedModules = this.loaded;
    delete(this.loaded);
    if (this.onLoadingFinished != null) {
        this.onLoadingFinished();
    }
    return true;
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
    if (this.apiLoaded) {
        this.loadRouteData();
        return;
    }
    var script = document.createElement("script");
    script.src = "https://maps.googleapis.com/maps/api/js?key=" + this.api.googleMapJsKey;
    script.type = "text/javascript";
    var routeLoader = this;
    script.onload = function () {
        routeLoader.loadRouteData();
    };
    document.getElementsByTagName("head")[0].appendChild(script);
    this.apiLoaded = true;
}


RouteLoader.prototype.loadRouteData = function (weatherCallback = this.weatherCallback, routeInfoCallback = this.routeInfoCallback, elevationsCallback = this.elevationsCallback, mapCallback = this.mapCallback) {
    initializeLoading(this);
    if (mapCallback != null) {
        mapCallback();
    }
    this.loadElevations(elevationsCallback);
    this.getRouteInfo(routeInfoCallback);
    this.getWeather(weatherCallback);
    return this.route;

    function initializeLoading(routeLoader) {
        routeLoader.loaded = {
            loadingCallback: false,
            map: true,
            elevations: undefined,
            routeInfo: undefined,
            weather: undefined
        };
    }
}

RouteLoader.prototype.loadElevations = function (elevationsCallback) {
    var elevator = new google.maps.ElevationService,
        routeLoader = this;

    elevator.getElevationAlongPath({
        "path": routeLoader.route.coordinates,
        "samples": 512
    }, processElevations);

    function processElevations(elevations, status) {
        if (status !== "OK") {
            routeLoader.route.elevations = null;
            routeLoader.route.processElevations();
            if (elevationsCallback != null) {
                elevationsCallback(status);
            }
            routeLoader.finishLoadingModule("elevations", status);
        } else {
            routeLoader.route.elevations = elevations;
            routeLoader.route.processElevations();
            if (elevationsCallback != null) {
                elevationsCallback();
            }
            routeLoader.finishLoadingModule("elevations");
        }
    }
}

RouteLoader.prototype.getRouteInfo = function (routeInfoCallback) {
    var routeLoader = this,
        dLat = routeLoader.route.bbox.maxLat - routeLoader.route.bbox.minLat,
        dLng = routeLoader.route.bbox.maxLng - routeLoader.route.bbox.maxLat;
    if (dLat * dLng > this.osmMaxDAngleSquare) {
        var sizeError = "Data limited to " + this.osmMaxDAngleSquare + "square angle of route bounding box due to big data size";
        if (routeInfoCallback != null) {
            routeInfoCallback(sizeError);
        }
        routeLoader.finishLoadingModule("routeInfo", sizeError);
        return;
    }
    return getResponse("http://overpass-api.de/api/xapi?way[bbox=" + routeLoader.route.bbox.minLng + "," + routeLoader.route.bbox.minLat + "," + routeLoader.route.bbox.maxLng + "," + routeLoader.route.bbox.maxLat +
        "][highway=*]", "document",
        function (error, data) {
            if (error != null) {
                routeInfoCallback(error);
                routeLoader.finishLoadingModule("routeInfo", error);
            } else {
                try {
                    roadsInfoJson = xmlToJson(data);
                    routeLoader.route.parseOsmData(roadsInfoJson);
                    if (routeInfoCallback != null) {
                        routeInfoCallback();
                    }
                    routeLoader.finishLoadingModule("routeInfo");
                } catch (parsingError) {
                    if (routeInfoCallback != null) {
                        routeInfoCallback(parsingError);
                    }
                    routeLoader.finishLoadingModule("routeInfo", parsingError);
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
                routeLoader.route.weather = new Weather();
                routeLoader.route.processWeatherExercise();
                if (weatherCallback != null) {
                    weatherCallback(error);
                }
                routeLoader.finishLoadingModule("weather", error);
            } else {
                try {
                    if (data["cod"] != "200") {
                        throw data["message"];
                    }
                    var windSpeed = ktphToMps(data["wind"]["speed"]),
                        windAngle = degToRad(data["wind"]["deg"]),
                        temperature = data["main"]["temp"],
                        pressure = data["main"]["pressure"] * 100,
                        humidity = data["main"]["humidity"] / 100;
                    routeLoader.route.weather = new Weather(pressure, temperature, humidity, windSpeed, windAngle);
                    parseWeatherDetails(routeLoader.route.weather, data);
                    routeLoader.route.processWeatherExercise();
                    if (weatherCallback != null) {
                        weatherCallback();
                    }
                    routeLoader.finishLoadingModule("weather");
                } catch (parsingError) {
                    routeLoader.route.weather = new Weather();
                    routeLoader.route.processWeatherExercise();
                    if (weatherCallback != null) {
                        weatherCallback(parsingError);
                    }
                    routeLoader.finishLoadingModule("weather", parsingError);
                }

            }
        });

    function parseWeatherDetails(weather, jsonData) {
        var weatherData = jsonData["weather"];
        if (weatherData != null) {
            weather.conditions = [];
            weather.descriptions = [];
            for (var i = 0; i < weatherData.length; i++) {
                weather.conditions.push(weatherData[i]["main"]);
                weather.descriptions.push(weatherData[i]["description"]);
            }
        }
        weather.cityName = jsonData["name"];
        weather.time = new Date(parseInt(jsonData["dt"]) * 1000);
        weather.sunrise = new Date(parseInt(jsonData["sys"]["sunrise"]) * 1000);
        weather.sunset = new Date(parseInt(jsonData["sys"]["sunset"]) * 1000);
        weather.country = jsonData["sys"]["country"];
        weather.cloudness = jsonData["clouds"]["all"] / 100;
        try {
            weather.rainPast3h = jsonData["rain"]["3h"];
        } catch (error) {}
        try {
            weather.snowPast3h = jsonData["snow"]["3h"];
        } catch (error) {}
    }
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
    this.energy = {
        E: 0,
        Ed: 0,
        Er: 0,
        Es: 0,
        Ea: 0
    }
    this.bbox = {
        minLat: 0,
        maxLat: 0,
        minLng: 0,
        maxLng: 0
    };
    this.weather = undefined;
    this.exercise = undefined;
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
        route.sections = [];
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
    if (this.elevations == null || this.elevations.length == 0) {
        this.elevations = [];
        for (var i = 0; i < this.coordinates.length; i++) {
            elevations.push({
                elevation: 0
            });
        }
    }
    for (var i = 0; i < this.sections.length; i++) {
        var elevationIndex = this.getElevationIndex(i);
        var nextElevationIndex = this.getElevationIndex(i + 1);
        this.sections[i].slope = this.elevations[nextElevationIndex].elevation - this.elevations[elevationIndex].elevation;
        this.sections[i].elevation = (this.elevations[nextElevationIndex].elevation + this.elevations[elevationIndex].elevation) / 2;
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

Route.prototype.processWeatherExercise = function () {
    for (var i = 0; i < this.sections.length; i++) {
        this.sections[i].headwind = this.weather.calculateHeadwind(this.sections[i].angle);
        this.sections[i].crosswind = this.weather.calculateCrosswind(this.sections[i].angle);
    }
    this.calculateEnergy();
}

Route.prototype.calculateEnergy = function () {
    this.energy.E = 0;
    this.energy.Ed = 0;
    this.energy.Er = 0;
    this.energy.Es = 0;
    this.energy.Ea = 0;

    if (this.exercise.a != 0) {
        var dt = this.exercise.vr / this.exercise.a;
        var aTotalDistance = this.exercise.vr / 2 * dt;
    } else {
        var aTotalDistance = 0;
    }
    var aDistance = aTotalDistance;

    var negativeE = 0;

    for (var i = 0; i < this.sections.length; i++) {
        this.sections[i].headwind = this.weather.calculateHeadwind(this.sections[i].angle);
        this.sections[i].crosswind = this.weather.calculateCrosswind(this.sections[i].angle);

        var aSectionDistance = Math.min(this.sections[i].distance, aDistance);
        aDistance -= aSectionDistance;

        var Ea = this.exercise.Ea(aSectionDistance) + this.exercise.EBraking(this.sections[i], aTotalDistance);
        this.energy.Ea += Ea;
        var sectionEnergy = this.exercise.E(this.sections[i], this.weather) + Ea;

        var E = sectionEnergy + negativeE;
        if (E < 0) {
            negativeE = E;
            this.sections[i].E = 0;
        } else {
            negativeE = 0;
            this.sections[i].E = E;
        }

        this.energy.E += sectionEnergy;
        this.energy.Ed += this.exercise.Ed(this.sections[i], this.weather);
        this.energy.Er += this.exercise.Er(this.sections[i], this.weather);
        this.energy.Es += this.exercise.Es(this.sections[i], this.weather);
    }
}

Route.prototype.parseOsmData = function (roadsInfoJson) {
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
    return this.elevations[this.elevations.length - 1].elevation - this.elevations[0].elevation;
}

Route.prototype.getTime = function () {
    return this.getDistance() / this.exercise.vr;
}

Route.prototype.getAverageHeadwind = function () {
    var distance = this.getDistance();
    var headwindDistance = 0;
    for (var i = 0; i < this.sections.length; i++) {
        headwindDistance += this.sections[i].headwind * this.sections[i].distance;
    }
    return headwindDistance / distance;
}


Route.prototype.getAverageCrosswind = function () {
    var distance = this.getDistance();
    var crosswindDistance = 0;
    for (var i = 0; i < this.sections.length; i++) {
        crosswindDistance += this.sections[i].crosswind * this.sections[i].distance;
    }
    return crosswindDistance / distance;
}

Route.prototype.getAverageAbsoluteCrosswind = function () {
    var distance = this.getDistance();
    var absoluteCrosswindDistance = 0;
    for (var i = 0; i < this.sections.length; i++) {
        absoluteCrosswindDistance += Math.abs(this.sections[i].crosswind) * this.sections[i].distance;
    }
    return absoluteCrosswindDistance / distance;
}

Route.prototype.getEnergyPerS = function () {
    return this.energy.E / this.getTime();
}

Route.prototype.getEnergyPerM = function () {
    return this.energy.E / this.getDistance();
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

Route.prototype.invert = function () {
    this.coordinates.reverse();
    this.elevations.reverse();
    this.sections.reverse();
    for (var i = 0; i < this.sections.length; i++) {
        this.sections[i].invert();
    }
    this.calculateEnergy();
}

var Coordinate = function (lat, lng) {
    this.lat = lat;
    this.lng = lng;
    this.highway = undefined;
    this.surface = undefined;
}

Coordinate.prototype.loadOsmRoadInfo = function (data) {
    var accuarcy = 0.000001;
    var id = findNodeId(data, this.lat, this.lng);
    parseNode(data, id, this);

    function findNodeId(data, lat, lon) {
        var nodes = data.osm.node;
        for (var i = 0; i < nodes.length; i++) {
            var dLat = Math.abs(nodes[i]["@attributes"]["lat"] - lat),
                dLon = Math.abs(nodes[i]["@attributes"]["lon"] - lon);
            if ((dLat < accuarcy) && (dLon < accuarcy)) {
                if (closest == null) {
                    var closest = {
                        dLat: dLat,
                        dLon: dLon,
                        id: nodes[i]["@attributes"]["id"]
                    }
                } else if ((dLat <= closest.dLat) && (dLon <= closest.dLon)) {
                    closest.dLat = dLat;
                    closest.dLon = dLon;
                    closest.id = nodes[i]["@attributes"]["id"];
                }
            }
        }
        if (closest == null) {
            return undefined;
        } else {
            return closest.id;
        }
    }

    function parseNode(data, id, node) {
        if (id == null) {
            this.highway = undefined;
        }
        var way = data.osm.way;
        if (way.constructor === Array) {
            parseWays(way, id, node);
        } else {
            parseWay(way, id, node);
        }
        associateSurfaceToHighway(node);
    }

    function parseWays(ways, id, node) {
        for (var i = 0; i < ways.length; i++) {
            parseWay(ways[i], id, node);
        }
    }

    function parseWay(way, id, node) {
        var refNode = way.nd;
        if (refNode.constructor === Array) {
            parseWayByReferredNodes(way, refNode, id, node);
        } else {
            parseWayByReferredNode(way, refNode, id, node)
        }
    }

    function parseWayByReferredNodes(way, refNodes, id, node) {
        for (var j = 0; j < refNodes.length; j++) {
            parseWayByReferredNode(way, refNodes[j], id, node);
        }
    }

    function parseWayByReferredNode(way, refNode, id, node) {
        if (refNode["@attributes"]["ref"] == id) {
            var tag = way.tag;
            if (tag.constructor === Array) {
                parseTags(tag, node)
            } else {
                parseTag(tag, node);
            }
        }
    }

    function parseTags(tags, node) {
        for (var k = 0; k < tags.length; k++) {
            parseTag(tags[k], node);
        }
    }

    function parseTag(tag, node) {
        if (tag["@attributes"]["k"] == "highway") {
            node.highway = tag["@attributes"]["v"];
        } else if (tag["@attributes"]["k"] == "surface") {
            node.surface = tag["@attributes"]["v"];
        } else if (tag["@attributes"]["k"] == "tracktype") {
            node.tracktype = tag["@attributes"]["v"];
        }
    }

    function associateSurfaceToHighway(node) {
        if (node.surface == null) {
            if (node.highway == null || node.highway == "path") {
                node.surface = "other";
            } else if (node.highway == "track") {
                if (node.tracktype == "grade1") {
                    node.surface = "solid"
                } else if (node.tracktype == "grade2") {
                    node.surface = "mostly solid";
                } else if (node.tracktype == "grade3") {
                    node.surface = "even mixture of hard and soft materials";
                } else if (node.tracktype == "grade4") {
                    node.surface = "mostly soft";
                } else if (node.tracktype == "grade5") {
                    node.surface = "soft";
                } else {
                    node.surface = "other";
                }
            } else {
                node.surface = "asphalt";
            }
        }
    }
};


var Section = function (p0, p1) {
    this.distance = calculateDistance(p0, p1);
    this.highway = undefined;
    this.surface = undefined;
    this.elevation = 0;
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

Section.prototype.invert = function () {
    this.slope = -this.slope;
    this.angle += Math.PI;
    this.headwind = -this.headwind;
    this.crosswind = -this.crosswind;
}

//https: //en.wikipedia.org/wiki/Standard_conditions_for_temperature_and_pressure
var Weather = function (p = 101325, T = 293.15, humidity = 0.5, windSpeed = 0, windAngle = 0, R = 8.314) {
    this.p = p;
    this.T = T;
    this.phi = humidity;
    this.R = R;
    this.windSpeed = windSpeed;
    this.windAngle = windAngle;

    this.conditions = undefined;
    this.descriptions = undefined;
    this.cityName = undefined;
    this.time = undefined;
    this.sunrise = undefined;
    this.sunset = undefined;
    this.country = undefined;
    this.cloudness = undefined;
    this.rainPast3h = undefined;
    this.snowPast3h = undefined;
}

//e.g. north wind is from north to south
Weather.prototype.getWindDirection = function () {
    var directionIndex = Math.round((this.windAngle / (Math.PI / 8))) % 16;
    directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
    return directions[directionIndex]
}

//https://en.wikipedia.org/wiki/Beaufort_scale
Weather.prototype.getBeaufortNumber = function () {
    return Math.round(Math.pow(this.windSpeed / 0.836, 2 / 3));
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

var Exercise = function (Cd, A, m, eta, v, a) {
    this.A = A;
    this.Cd = Cd;
    this.mExerciser = m;
    this.m = m;
    this.eta = eta;
    this.vr = v;
    this.a = a;
    this.brakingEstimated = false;
    this.brakeDistance = 500;
}

Exercise.prototype.Pinitial = function (section, weather) {
    return (this.Pd(section, weather) + this.Pr(section, weather) + this.Ps(section, weather) + this.Pa()) / this.eta;
}
Exercise.prototype.P = function (section, weather) {
    return (this.Pd(section, weather) + this.Pr(section, weather) + this.Ps(section, weather)) / this.eta;
}
Exercise.prototype.Pd = function (section, weather) {
    return this.Fd(section, weather) * (this.vr + section.headwind);
}
Exercise.prototype.Fd = function (section, weather) {
    var va = this.vr + section.headwind;
    return 0.5 * weather.rho() * va * va * this.Cd * this.A;
}
Exercise.prototype.Pa = function () {
    return this.vr * this.m * this.a;
}
Exercise.prototype.PToW = function (P, s, vr = this.vr) {
    return (P * s / vr);
}
Exercise.prototype.Einitial = function (section, weather, aDistance) {
    return this.PToW(this.P(section, weather), section.distance) + this.Ea(section, weather, aDistance);
}
Exercise.prototype.E = function (section, weather) {
    return this.PToW(this.P(section, weather), section.distance);
}
Exercise.prototype.Ed = function (section, weather) {
    return this.PToW(this.Pd(section, weather), section.distance) / this.eta;
}
Exercise.prototype.Er = function (section, weather) {
    return this.PToW(this.Pr(section, weather), section.distance) / this.eta;
}
Exercise.prototype.Es = function (section, weather) {
    return this.PToW(this.Ps(section, weather), section.distance) / this.eta;
}
Exercise.prototype.Ea = function (aDistance) {
    return this.PToW(this.Pa(), aDistance) / this.eta;
}
Exercise.prototype.EBraking = function (section, aDistance) {
    if (this.brakingEstimated) {
        return this.Ea(aDistance) * section.distance / this.brakeDistance;
    } else {
        return 0;
    }
}

//https://en.wikipedia.org/wiki/Bicycle_performance
var Cycling = function (Cd = 1, A = 0.5, m = 95, eta = 1, v = 10, a = 0.5, mw = 0) {
    Exercise.call(this, Cd, A, m, eta, v, a)
    this.mw = mw;
    this.name = "Rolling";
}
Cycling.prototype = Object.create(Exercise.prototype);
Cycling.prototype.constructor = Cycling;

Cycling.prototype.Pa = function () {
    return this.vr * (this.m + this.mw) * this.a;
}
Cycling.prototype.Pr = function (section, weather) {
    return this.vr * this.m * weather.g(section.lat, section.elevation) * Math.cos(Math.atan(section.s())) * Crr(section, this.vr);

    //Based on http://www.engineeringtoolbox.com/rolling-friction-resistance-d_1303.html; 9th Conference of the International Sports Engineering Association (ISEA), Cycling comfort on different road surfaces, Christin Hölzela*, Franz Höchtla, Veit Sennera; http://wiki.openstreetmap.org/wiki/Key:surface
    function Crr(section, vr) {
        var speedCorrection = 1 + vr / 20;
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
}
Cycling.prototype.Ps = function (section, weather) {
    return this.vr * this.m * weather.g(section.lat, section.elevation) * Math.sin(Math.atan(section.s()));
}

//Values for Cycling in "Tops" position from "Bicycling Science" (Wilson, 2004)
var CityCycling = function (vr = kphToMps(20), mExerciser = 80, brakingEstimated = true) {
    Cycling.call(this, 1.15, 0.632, mExerciser, 0.8, vr, 0.5, 2 * 2.5);
    var cycleWeight = 15;
    this.m = mExerciser + cycleWeight;
    this.brakingEstimated = brakingEstimated;
};
CityCycling.prototype = Object.create(Cycling.prototype);
CityCycling.prototype.constructor = CityCycling;

var RaceCycling = function (vr = kphToMps(30), mExerciser = 80, brakingEstimated = false) {
    Cycling.call(this, 0.88, 0.32, mExerciser, 0.95, vr, 1.5, 2 * 1);
    var cycleWeight = 5;
    this.m = mExerciser + cycleWeight;
    this.brakingEstimated = brakingEstimated;
};
//Values for Cycling in "Drops" position from "The effect of crosswinds upon time trials" (Kyle,1991)
RaceCycling.prototype = Object.create(Cycling.prototype);
RaceCycling.prototype.constructor = CityCycling;

//Values based on the data from Penwarden, A.D., P.F. Grigg, and R. Rayment. 1978. Measurement of wind drag on people standing in a wind tunnel. Building Environ. 13: 75-84.
//Mechanical efficiency in athletes during running, Authors: H. Kyröläinen, P. V. Komi, A. Belli
var Running = function (vr = kphToMps(15), mExerciser = 80, brakingEstimated = false) {
    Exercise.call(this, 1.27, 0.55, mExerciser, 0.55, vr, 2.5)
    this.brakingEstimated = brakingEstimated;
    this.name = "Running";
};
Running.prototype = Object.create(Exercise.prototype);
Running.prototype.constructor = Running;

//Based on "Energetics of Walking and Running", J. C. Sprott.
Running.prototype.Pr = function (section, weather) {
    return this.vr * this.m * weather.g(section.lat, section.elevation) * Math.cos(Math.atan(section.s())) / 5 / mu(section);
}
Running.prototype.Ps = function (section, weather) {
    return this.vr * this.m * weather.g(section.lat, section.elevation) * Math.sin(Math.atan(section.s())) / 5;
}

//Values based on the data from Penwarden, A.D., P.F. Grigg, and R. Rayment. 1978. Measurement of wind drag on people standing in a wind tunnel. Building Environ. 13: 75-84.
//Mechanical efficiency in athletes during running, Authors: H. Kyröläinen, P. V. Komi, A. Belli
var Walking = function (vr = kphToMps(5), mExerciser = 80, brakingEstimated = false) {
    Exercise.call(this, 1.27, 0.55, mExerciser, 0.55, vr, 1)
    this.brakingEstimated = brakingEstimated;
    this.name = "Walking";
};
Walking.prototype = Object.create(Exercise.prototype);
Walking.prototype.constructor = Walking;

//Based on "Energetics of Walking and Running", J. C. Sprott 
Walking.prototype.Pr = function (section, weather) {
    var g = weather.g(section.lat, section.elevation),
        L = 1;
    return (this.m * g / Math.PI) * Math.sqrt(3 * g * L / 2) * (1 - Math.sqrt(1 - Math.PI * Math.PI * this.vr * this.vr / (6 * g * L))) * Math.cos(Math.atan(section.s())) / mu(section);
}

//Based on rubber or PU solid shoe; http://wiki.openstreetmap.org/wiki/Key:surface
function mu(section) {
    switch (section.surface) {
        case "wood":
        case "tartan":
        case "clay":
        case "metal":
            return 1;
        case "concrete":
            return 1;
        case "paved":
        case "paving_stones":
        case "paving_stones:30":
        case "concrete:lanes":
        case "concrete:plates":
            return 0.95;
        case "asphalt":
            return 0.9;
        case "solid":
        case "sett":
        default:
            return 0.85;
        case "mostly solid":
        case "grass_paver":
        case "fine_gravel":
            return 0.8;
        case "even mixture of hard and soft materials":
            return 0.75;
        case "mostly soft":
        case "cobblestone":
            return 0.7;
        case "soft":
        case "sand":
        case "compacted":
        case "pebblestone":
            return 0.65;
        case null:
        case "unpaved":
        case "other":
        case "gravel":
        case "earth":
            return 0.7;
        case "grass":
        case "dirt":
            return 0.75;
        case "mud":
            return 0.5;
    }
}
Walking.prototype.Ps = function (section, weather) {
    var g = weather.g(section.lat, section.elevation),
        L = 1;
    return (this.m * g / Math.PI) * Math.sqrt(3 * g * L / 2) * (1 - Math.sqrt(1 - Math.PI * Math.PI * this.vr * this.vr / (6 * g * L))) * Math.sin(Math.atan(section.s()));
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

function fat87ToKcal(m) {
    return 0.87 * m * 9000;
}

//https://en.wikipedia.org/wiki/Basal_metabolic_rate
function bmr(weight, heightCm, age, isMale) {
    return 10 * weight + 6.25 * heightCm - 5 * age + (isMale ? 5 : -161);
}

//https: //en.wikipedia.org/wiki/Body_mass_index
function bmi(weight, heightCm) {
    return 10000 * weight / heightCm / heightCm;
}

//https://en.wikipedia.org/wiki/Metabolic_equivalent
function met(energyKcal, weight, hours) {
    return energyKcal / weight / hours;
}

var XmlNode = {
    ELEMENT: 1,
    MEDIUM: 2,
    TEXT: 3
};

function parseXml(xml) {
    "use strict";
    var parser, xmlDoc;
    if (window.DOMParser) {
        parser = new window.DOMParser();
        xmlDoc = parser.parseFromString(xml, "text/xml");
    } else {
        xmlDoc = new window.ActiveXObject("Microsoft.XMLDOM");
        xmlDoc.async = false;
        xmlDoc.loadXML(xml);
    }
    if (xmlDoc === undefined || xmlDoc === null) {
        throw new Error("Error while parsing xml string.");
    }
    return xmlDoc;
}

function xmlToJson(xml) {
    "use strict";
    var result = {};

    if (xml.nodeType === XmlNode.ELEMENT) {
        if (xml.attributes.length > 0) {
            result["@attributes"] = {};
            for (var i = 0; i < xml.attributes.length; i++) {
                var attribute = xml.attributes.item(i);
                result["@attributes"][attribute.nodeName] = attribute.nodeValue;
            }
        }
    } else if (xml.nodeType == XmlNode.TEXT) {
        result = xml.nodeValue;
    }

    if (xml.hasChildNodes()) {
        for (var i = 0; i < xml.childNodes.length; i++) {
            var item = xml.childNodes.item(i);
            var nodeName = item.nodeName;
            if (typeof (result[nodeName]) === "undefined") {
                result[nodeName] = xmlToJson(item);
            } else {
                if (typeof (result[nodeName].push) === "undefined") {
                    var old = result[nodeName];
                    result[nodeName] = [];
                    result[nodeName].push(old);
                }
                result[nodeName].push(xmlToJson(item));
            }
        }
    }
    return result;
}
