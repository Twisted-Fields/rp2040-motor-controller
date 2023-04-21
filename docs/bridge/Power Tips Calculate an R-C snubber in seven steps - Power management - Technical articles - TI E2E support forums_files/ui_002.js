(function($, global) {

	$.telligent = $.telligent || {};
	$.telligent.evolution = $.telligent.evolution || {};
	$.telligent.evolution.widgets = $.telligent.evolution.widgets || {};

	var inited = false,
		sliderContentLoaders = [],
		sliderContentLoaderDeferreds = null,
		minWidth = 570,
		maxItems = 3;

	function ignoreRecommendation(contentId) {
		return $.telligent.evolution.post({
			url: $.telligent.evolution.site.getBaseUrl() + 'api.ashx/v2/content/recommendation/ignore/{ContentId}.json',
			data: { ContentId: contentId }
		});
	}

	function ignoreUserRecommendation(userId) {
		return $.telligent.evolution.post({
			url: $.telligent.evolution.site.getBaseUrl() + 'api.ashx/v2/user/recommendation/ignore/{UserId}.json',
			data: { UserId: userId }
		});
	}

	function reloadCurrentRecommendationPage(target) {
		var currentRecommendationList = target.closest('.content-list');
		var callbackUrl = currentRecommendationList.data('callbackurl');
		var pageIndex = currentRecommendationList.data('pageindex');
		var pageKey = currentRecommendationList.data('pagekey');
		var container = currentRecommendationList.parent();

		if(currentRecommendationList.hasClass('slider'))
			return;

		var query = {};
		query[pageKey] = pageIndex;
		var pagedCallbackUrl = $.telligent.evolution.url.modify({
			url: callbackUrl,
			query: query,
			hash: query
		});

		$.telligent.evolution.get({ url: pagedCallbackUrl }).then(function(response){
			container.html(response);
		});
	}

	function handleIgnores(context) {
		$(context.content).on('tap', function(){ })
			.on('swipeleft swiperight', 'li.content-item', function(e){
				$(this).find('.ignore').removeClass('ignore');
			});
		// subscribe to recommendation ignore clicks
		$.telligent.evolution.messaging.subscribe('telligent.evolution.widgets.more.ignore', function(data) {
			var target = $(data.target);

			if (target.data('contentid')) {
				// ignore the recommendation, reload the current page of recommendations, and remove the item
				ignoreRecommendation(target.data('contentid')).then(function(){
					reloadCurrentRecommendationPage(target);
					target.closest('.content-item').slideUp(100);
					$.fn.evolutionTip.hide();
				});
			} else if (target.data('userid')) {
				ignoreUserRecommendation(target.data('userid')).then(function(){
					reloadCurrentRecommendationPage(target);
					target.closest('.content-item').slideUp(100);
					$.fn.evolutionTip.hide();
				});
			}
		})
	}

	// loads all registered slider content loaders (from any widget instances) raises each as content
	function deferredLoadAllRegisteredSliderContent(context) {
		sliderContentLoaderDeferreds = sliderContentLoaderDeferreds || $.map(sliderContentLoaders, function(loader){
			// for each registered loader, load the deferred, paged, content. then raise the content in a message for the slider
			return loader.loader().then(function(loadedContent){
				// then
				var content = $(loader.context.content);
				if(content.find('.content-list').first().length > 0) {
					$.telligent.evolution.messaging.publish('telligent.evolution.widgets.more.slideablecontent', {
						title: loader.context.title,
						content: content
					});
				}
			});
		});
		return $.when.apply($, sliderContentLoaderDeferreds);
	}

	function initSlider(context) {
		// slider can show content from its host instance of the MoreContent widget as well
		// as any other instance of the widget on the page.
		// Slider has a single instance that collects messages raised by all slider-configured
		// MoreContent widgets on the apge.
		var contentToShow = [];
		$.telligent.evolution.messaging.subscribe('telligent.evolution.widgets.more.slideablecontent', function(data) {
			// collect content to show in the slider
			// only show the first N items
			var contentListItems = data.content.find('ul.content-list>li').clone().slice(0, maxItems);
			if(contentListItems.length == 0)
				return;
			data.content = $('<ul class="content-list slider"></ul>').append(contentListItems).get(0).outerHTML;
			contentToShow.push(data);
		});
		// handle explicit closing of the more slider
		$.telligent.evolution.messaging.subscribe('telligent.evolution.widgets.more.slider.close', function() {
			$.evolutionScrollSlider.hide();
			context.preventReOpen = true;
		});

		var template = $.telligent.evolution.template.compile(context.sliderTemplate);

		setTimeout(function(){
			// init a single instance of the slider
			$.evolutionScrollSlider({
				load: function(complete) {
					deferredLoadAllRegisteredSliderContent(context).then(function(){
						// if previousl explicitly closed, don't re-open
						if(context.preventReOpen)
							return null;
						// don't show slider when in page edit mode or narrow/handheld
						if(isInEditMode() || !isWiderThanMinWidth())
							return null;
						if(!contentToShow || contentToShow.length == 0)
							return null;
						complete(template({ contents: contentToShow }));
					})
				},
				revealAt: context.slideAt,
				className: 'recommended-content-slider',
				width: 250
			})
		}, 500);
	}

	function isInEditMode() {
		return $('body').hasClass('edit');
	}

	function isWiderThanMinWidth() {
		return $(window).width() > minWidth;
	}

	// loads the initial paged content for this widget context, and renders it
	// returns a promise when done
	function loadPagedContent(context) {
		if(context.loaded) {
			return $.Deferred(function(d){ d.resolve() }).promise();
		} else {
			context.loaded = true;
			return $.telligent.evolution.get({
				url: context.delayedPagedContentUrl
			}).then(function(content){
				// if content, show the widget
				if($.trim(content || '').length > 0) {
					if(!context.useSlider || !isWiderThanMinWidth())
						$(context.wrapper).show();
					$('#' + context.delayedPagedContentWrapper).html(content);
				}
			});
		}
	}

	$.telligent.evolution.widgets.moreContent = {
		register: function(context) {
			// hide the widget until we know if it has content and not in edit mode
			if(!context.isPreview && !isInEditMode()){
				$(context.wrapper).hide();
			}
			// if entering page customization, re-show it
			$(document).on('customizepage', function(){
				$(context.wrapper).show();
			});
			// if should use slider, capture reference to function
			// which loads the slider content when it's needed
			// along with any others
			if(context.useSlider) {
				var loaderContext = {
					context: context,
					loader: function(){
						return loadPagedContent(context);
					}
				};
				sliderContentLoaders.push(loaderContext);
				if(!isWiderThanMinWidth()) {
					loaderContext.loader();
				}
			} else {
				// if explicitly a list, load content immediately
				setTimeout(function(){
					loadPagedContent(context);
				}, 10)
			}

			// only a single instance of the slider and ignore handlers
			if(!inited) {
				if(context.useSlider) {
					initSlider(context);
				}
				handleIgnores(context);
				inited = true;
			}
		}
	};

})(jQuery, window);
