var Node = {
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

    if (xml.nodeType === Node.ELEMENT) {
        if (xml.attributes.length > 0) {
            result["@attributes"] = {};
            for (var i = 0; i < xml.attributes.length; i++) {
                var attribute = xml.attributes.item(i);
                result["@attributes"][attribute.nodeName] = attribute.nodeValue;
            }
        }
    } else if (xml.nodeType == Node.TEXT) {
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
