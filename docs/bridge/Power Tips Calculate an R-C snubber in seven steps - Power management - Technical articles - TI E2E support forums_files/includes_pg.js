//*** sitecat.js ***//
function QueryStringToJSON(inStr) {
    var pairs = inStr.split('&');

    var result = {};
    pairs.forEach(function (pair) {
        pair = pair.split('=');
        result[pair[0]] = decodeURIComponent(pair[1] || '');
    });

    return JSON.parse(JSON.stringify(result));
}

function _TrackSC(url, bucket) {

    try {
        onclickTrack(bucket,"Community Participation", tiPageName, tiContentGroup);
    }
    catch (err) {
    }
}

(function ($) {

    _addHandlers = function (context) {
        $(".save-user-profile").click(function (e) {
            _TrackSC(window.location, 'Content and Member Engagement');
        });

        $(".download-attachment").click(function (e) {
            _TrackSC(window.location, 'Content and Member Engagement');
        });

        jQuery(function () {
            // all REST URLs would start with this
            var endpointPrefix = jQuery.telligent.evolution.site.getBaseUrl() + 'api.ashx';

            // after any ajax request successfully completes
            jQuery(document).ajaxSuccess(function (event, jqXHR, ajaxOptions, data) {
                event.stopPropagation
                // test if it was against a REST endpoint
                if (ajaxOptions.url.indexOf(endpointPrefix) === 0) {
                    // if so, publish a client-side message with data about it
                    jQuery.telligent.evolution.messaging.publish('rest.success', {
                        // the REST endpoint without the prefix
                        endpoint: ajaxOptions.url.substr(endpointPrefix.length - 8),
                        // REST method
                        requestMethod: ajaxOptions.type,
                        // Object of data passed to the endpoint, including query string and (any) post data
                        requestData: jQuery.extend(jQuery.telligent.evolution.url.parseQuery(ajaxOptions.url),
                            jQuery.telligent.evolution.url.parseQuery(ajaxOptions.data || '')),
                        // response data from the server
                        responseData: data
                    })
                }
            });
        });
        jQuery(function () {
            // example of globally handling any successful Ajax REST request
            jQuery.telligent.evolution.messaging.subscribe('rest.success', function (data) {
                if (data.endpoint === 'api.ashx/v2/ratings.json') {
                    _TrackSC(window.location, 'Content and Member Engagement');
                }
                if (data.endpoint === 'api.ashx/v2/comments.json') {
                    _TrackSC(window.location, 'Reply to Existing Content');
                }
                if ((data.endpoint.indexOf('api.ashx/v2/bookmark.json') === 0) && (data.responseData.Info.length === 0)) {
                    _TrackSC(window.location, 'Content and Member Engagement');
                }

                //"api.ashx/v2/bookmark.json?ContentId=1d69a47f-8d3c-422e-9a89-75827f421020&ContentTypeId=48f9bad6-9756-4845-ab98-382808c7bced"
                // "Bookmark was deleted" = responseData.Info[0]
            });

        });


    }

    var api = {
        register: function (context) {
            _addHandlers(context);
        }
    };

    if (typeof $.telligent === 'undefined') { $.telligent = {}; }
    if (typeof $.telligent.evolution === 'undefined') { $.telligent.evolution = {}; }
    if (typeof $.telligent.evolution.widgets === 'undefined') { $.telligent.evolution.widgets = {}; }
    $.telligent.evolution.widgets.scglobal = api;
} (jQuery));
