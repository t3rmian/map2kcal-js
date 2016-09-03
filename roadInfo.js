function Coordinate(lat, lng) {
    this.lat = lat;
    this.lng = lng;
    this.highway = undefined;
}

Coordinate.prototype.loadOsmRoadInfo = function (data) {
    var id = findNodeId(data, this.lat, this.lng);
    parseNode(data, id, this);
};

var accuarcy = 0.000001;

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
            } else if ((dLat < closest.dLat) && (dLon < closest.dLon)) {
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
    }
}
