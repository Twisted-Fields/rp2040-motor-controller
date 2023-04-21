(function ($) {

	function throttle(handler) {
		if (!window.requestAnimationFrame)
			return handler;
		var timeout;
		return function () {
			if (timeout)
				window.cancelAnimationFrame(timeout);
			timeout = window.requestAnimationFrame(handler);
		};
	}

	var defaults = {
		adaptiveHeaders: true,
		adaptiveHeadersMinWidth: null,
		dockedSidebars: true
	};

	$.telligent.evolution.theme.social = {
		register: function (options) {
			var settings = $.extend({}, defaults, options || {});

			if (settings.adaptiveHeaders) {
				var initAdaptiveHeaders = function() {
					// adapt the header when scrolled
					$('.header-fragments .layout-content').evolutionAdapativeHeader({
						fix: '.layout-region.header',
						activeClass: 'scrolled',
						minWidth: settings.adaptiveHeadersMinWidth
					});
				}
				// if using a dynamic cover, wait for it to load
				if ($('body').hasClass('dynamic-cover') && !$('body').hasClass('no-cover')) {
					$(window).one('dynamic-cover-loaded', function() {
						initAdaptiveHeaders();
					});
				} else {
				    initAdaptiveHeaders();
				}
			}

			if (settings.dockedSidebars) {
				// dock the sidebar when possible
				$('.content-fragment-page')
					.find('.layout-content.content-left-sidebar-right, .layout-content.sidebar-left-content-center-sidebar-right, .layout-content.sidebar-left-content-right, .layout-content.header-top-content-left-sidebar-right, .layout-content.header-top-sidebar-left-content-center-sidebar-right, .layout-content.header-top-sidebar-left-content-right, .layout-content.header-top-content-left-sidebar-right-footer, .layout-content.header-top-sidebar-left-content-center-sidebar-right-footer, .layout-content.header-top-sidebar-left-content-right-footer')
					.find('.layout-region-inner.right-sidebar, .layout-region-inner.left-sidebar')
					.evolutionDock({});
			}

			// edit
			$(document).on('customizepage', function () {
				$('body').addClass('edit');
			});

			// raise available height messages
			var availableHeight = 0,
				win = $(window),
				headerElements = $('.header-fragments .layout-content, .header-fragments .layout-region.header');


			function getHeaderOffset() {
				var headerOffset = 0;
				headerElements.each(function () {
					var header = $(this);
					if (header.is(':visible') && header.css('position') == 'fixed') {
						var offset = parseInt(header.css('top'), 10);
						if (isNaN(offset)) {
							offset = 0;
						}
						offset += header.outerHeight();
						if (offset > headerOffset) {
							headerOffset = offset;
						}
					}
				});
				return headerOffset;
			}

			win.on('scroll resize', throttle(function () {
				var scrollHeight = win.height();
				var headerOffsetTop = getHeaderOffset();
				var measuredHeight = scrollHeight - headerOffsetTop;

				if (availableHeight != measuredHeight) {
					$.telligent.evolution.messaging.publish('window.scrollableheight', {
						height: measuredHeight
					});
					availableHeight = measuredHeight;
				}
			}));
		}
	}

})(jQuery);

// Overrides

// override modals
$.extend($.glowModal.defaults, {
	isDraggable: true,
	isResizable: false,
	loadingHtmlUrl: 'about:blank',
	windowCssClasses: ['modal'],
	windowTitleCssClasses: ['modal-title'],
	windowCloseCssClasses: ['modal-close-wrapper', 'modal-close'],
	windowContentCssClasses: ['modal-content'],
	windowMaskCssClasses: ['modal-mask'],
	windowFooterCssClasses: ['modal-footer'],
	windowWrapperCssClasses: [],
	loadingHtml: '<span class="ui-loading" style="color: #ddd;"></span>',
	height: 100
});

$.extend($.fn.glowPopUpPanel.defaults, {
	animate: function (data) {
		return $.Deferred(function (d) {
			if (data.action == 'initialize') {
				data.panel.css({
					overflow: 'hidden',
					transform: 'translate3d(0px 0px, 0px)'
				});
				d.resolve();
			} else if (data.action == 'open') {
				var initialX = 0,
					initialY = 0;

				if (data.position.indexOf('left') === 0) {
					initialX = data.openerWidth;
				} else if (data.position.indexOf('right') === 0) {
					initialX = -data.openerWidth;
				}

				if (data.position.indexOf('down') === 0) {
					initialY = -data.openerHeight;
				} else if (data.position.indexOf('up') === 0) {
					initialY = data.openerHeight;
				}

				data.panel
					.evolutionTransform({
						x: initialX,
						y: initialY,
						opacity: 0
					}, {
						duration: 0
					})
					.evolutionTransform({
						x: 0,
						y: 0,
						opacity: 1
					}, {
						complete: function () {
							d.resolve();
						},
						duration: 150,
						easing: 'ease-out'
					});

			} else if (data.action == 'resize') {
				data.panel.css({
					width: data.orginalWidth + 'px',
					height: data.originalHeight + 'px'
				}).evolutionTransform({
					width: data.width,
					height: data.height
				}, {
					complete: function () {
						d.resolve();
					},
					duration: 150
				});
			} else if (data.action == 'close') {
				var targetX = 0,
					targetY = 0;

				if (data.position.indexOf('left') === 0) {
					targetX = data.openerWidth;
				} else if (data.position.indexOf('right') === 0) {
					targetX = -data.openerWidth;
				}

				if (data.position.indexOf('down') === 0) {
					targetY = -data.openerHeight;
				} else if (data.position.indexOf('up') === 0) {
					targetY = data.openerHeight;
				}

				data.panel.evolutionTransform({
					x: targetX,
					y: targetY,
					opacity: 0
				}, {
					complete: function () {
						data.panel.evolutionTransform({
							visibility: 'hidden',
							opacity: 1,
							x: 0,
							y: 0
						}, {
							duration: 0
						});
						d.resolve();
					},
					duration: 150,
					easing: 'ease-in'
				});
			} else {
				d.resolve();
			}
		}).promise();
	}
});


(function ($, global, undef) {

	function throttle(handler) {
		if (!window.requestAnimationFrame)
			return handler;
		var timeout;
		return function () {
			if (timeout)
				window.cancelAnimationFrame(timeout);
			timeout = window.requestAnimationFrame(handler);
		};
	}

	function process(context) {
		var width = context.selection.width(),
			scrollTop = $(global).scrollTop();

		// if too narrow, don't process, just possibly disable
		if (width <= context.minWidth) {
			// disable if was enabled and screen now too narrow to support this behavior
			if (context.enabled) {
				context.enabled = false;
				unfix(context);

				if (context.adapted) {
					unadapt(context);
				}
			}
			// and do no more...
			return;
		}

		var documentHeight = $(document).height();
		var windowHeight = $(window).height();
		var difference = context.staticHeight - context.minimizedHeight;

		var documentIsLongEnoughToAdapt = documentHeight - difference  - context.fixedElementsHeight * 2 > windowHeight;

		if (!context.adapted && scrollTop > difference && documentIsLongEnoughToAdapt) {
			adapt(context);
		} else if (context.adapted && scrollTop <= difference) {
			unadapt(context);
		}

		// enable if not enabled at all
		if (!context.enabled) {
			context.enabled = true;
			if (scrollTop == 0) {
				fix(context);
			}
		}
	}

	function unfix(context) {
		if(!context.fixed)
			return;
		context.fixed = false;
		var bodyPadding = parseInt(context.body.css("paddingTop"), 10) - context.fixedElementsHeight;
		bodyPadding = bodyPadding >= 0 ? bodyPadding : 0;
		context.body.css({
			paddingTop: bodyPadding
		});
		context.fixedElements.css({
			position: 'static'
		});
	}

	function fix(context) {
		if(context.fixed)
			return;
		context.fixed = true;
		var bodyPadding = parseInt(context.body.css("paddingTop"), 10);
		context.body.css({
			paddingTop: ('+=' + context.fixedElementsHeight)
		});
		bodyPadding = parseInt(context.body.css("paddingTop"), 10);
		context.fixedElements.css({
			position: 'fixed',
			top: 0,
			'z-index': 10
		});
	}

	function adapt(context) {
		context.adapted = true;

		unfix(context);

		context.body.css({
			paddingTop: ('+=' + context.staticHeight)
		});
		context.selection.css({
			position: 'fixed',
			top: 0,
			'z-index': 10
		}).addClass(context.activeClass);
		$.telligent.evolution.messaging.publish(context.scrolledMessage);
	}

	function unadapt(context) {
		context.adapted = false;

		fix(context);

		context.selection.css({
			position: 'static'
		}).removeClass(context.activeClass);
		context.body.css({
			paddingTop: ('-=' + context.staticHeight)
		});
		$.telligent.evolution.messaging.publish(context.unscrolledMessage);
	}

	function handleEvents(context) {
		// re-init only when width changes
		var resizedTimeout;
		var lastWidth = $(global).width();
		
		var reset = function() {
		    unadapt(context);
			unfix(context);
			context.body.css({ 'padding-top': 0 });
			context.fixedElementsHeight  = context.fixedElements.height();
			context.staticHeight = context.selection.height();
			process(context);
		};

		$(global).on('resized.adaptiveHeader', throttle(function () {
		    global.clearTimeout(resizedTimeout);
			resizedTimeout = global.setTimeout(function(){
				var currentWidth = $(global).width();
				if (currentWidth == lastWidth)
					return;
				lastWidth = currentWidth;
				reset();
			}, 250);
		}));
		
	    context.selection.on('resized.adaptiveHeader', throttle(function() {
			reset();
	    }));

		$(global).on('scroll.adaptiveHeader', throttle(function () {
			process(context);
		}));

		// when entering page edit mode, turn everything back off
		$(document).on('customizepage', function () {
			unadapt(context);
			unfix(context);
			context.body.css({
				'padding-top': 0
			});
			$(global).off('.adaptiveHeader');
		});
	}

	// determines minimized/scrolled height breakpoint by testing
	// the height when the scrolled class is applied
	function measureMinimizedHeight(context) {
		context.selection
			.css({
				visibility: 'hidden'
			})
			.addClass(context.activeClass);

		var height = context.selection.height();

		context.selection
			.removeClass(context.activeClass)
			.css({
				visibility: 'visible'
			});

		return height;
	}

	$.fn.evolutionAdapativeHeader = function (options) {
		var context = $.extend({}, $.fn.evolutionAdapativeHeader.defaults, options || {});
		context.selection = this;
		context.body = $('body');

		// capture elements
		context.fixedElements = $(context.fix, this);
		context.fixedElementsHeight = context.fixedElements.height();
		context.staticHeight = context.selection.height();

		if (!context.minimizedHeight) {
			context.minimizedHeight = measureMinimizedHeight(context);
		}

		handleEvents(context);
		process(context);

		return context.selection;
	}

	$.fn.evolutionAdapativeHeader.defaults = {
		fix: '.layout-region.header',
		// pre-defined breakpoint (when not provided, determines one by measuring height when activeClass is applied)
		minimizedHeight: null,
		//don't activate or remove behavior when screen less than
		minWidth: $.telligent.evolution.theme.getReflowBreakpoint(),
		activeClass: 'scrolled',
		scrolledMessage: 'theme.social.scrolled',
		unscrolledMessage: 'theme.social.unscrolled'
	};

})(jQuery, window);


(function ($, global, undef) {

	function throttle(handler) {
		if (!window.requestAnimationFrame)
			return handler;
		var timeout;
		return function () {
			if (timeout)
				window.cancelAnimationFrame(timeout);
			timeout = window.requestAnimationFrame(handler);
		};
	}

	$.fn.evolutionDock = function (options) {
		var settings = $.extend({}, $.fn.evolutionDock.defaults, options || {}),
			fixedSupported = true,
			availableHeight = $(window).height();

		(function () {
			var test = $('<div></div>').css({
				'position': 'fixed',
				'top': '100px'
			});
			$('body').append(test);
			fixedSupported = test.offset().top == 100 + $(global).scrollTop();

			global.setTimeout(function () {
				fixedSupported = test.offset().top == 100 + $(global).scrollTop();
				test.remove();
			}, 199);
		})();

		return this.each(function () {
			var dockWrapper = $(this),
				jGlobal = $(global),
				top = dockWrapper.offset().top,
				defaults = {
					top: dockWrapper.css('top'),
					position: dockWrapper.css('position'),
					width: dockWrapper.css('width')
				},
				docked = false,
				scrollOffset = undefined,
				lastScroll = undefined,
				absTop = undefined,
				lastWindowHeight = jGlobal.height(),
				placeholder = $('<div></div>').attr({
					'class': dockWrapper.attr('class'),
					'visibility': 'hidden'
				}).hide(),
				footers = $(settings.footers);

			dockWrapper.parent().css('position', 'relative').append(placeholder);

			var reposition = function () {
					var scrollTop = jGlobal.scrollTop();
					if (scrollTop == lastScroll) {
						return;
					}
					var parentOffset = dockWrapper.parent().offset();
					var headerOffsetTop = $(window).height() - availableHeight;

					var shouldBeFixed = fixedSupported && scrollTop > parentOffset.top - headerOffsetTop;

					if (shouldBeFixed) {
						if (!docked) {
							placeholder.show().css('height', dockWrapper.innerHeight() + 'px');
							scrollOffset = 0;
							lastScroll = scrollTop;
						}

						var footerOffsetTop = getFooterTop();
						var top = null,
							position, dockOuterHeight = dockWrapper.outerHeight();
						if (footerOffsetTop == -1 || (scrollTop + headerOffsetTop + dockOuterHeight - scrollOffset) < footerOffsetTop) {
							if (dockOuterHeight > availableHeight) {
								if (lastScroll < scrollTop) {
									// moving down
									scrollOffset += (scrollTop - lastScroll);
									if (scrollOffset >= dockOuterHeight - availableHeight) {
										scrollOffset = dockOuterHeight - availableHeight;
										position = 'fixed';
										top = headerOffsetTop - scrollOffset;
										absTop = scrollTop - (parentOffset.top - headerOffsetTop) - (dockOuterHeight - availableHeight);
									} else {
										position = 'absolute';
										top = absTop;
									}
								} else {
									// moving up
									scrollOffset -= (lastScroll - scrollTop);
									if (scrollOffset <= 0 || !docked) {
										scrollOffset = 0;
										position = 'fixed';
										top = headerOffsetTop;
										absTop = scrollTop - (parentOffset.top - headerOffsetTop);
									} else {
										position = 'absolute';
										top = absTop;
									}
								}
							} else {
								top = headerOffsetTop;
								absTop = scrollTop - (parentOffset.top - headerOffsetTop);
								position = 'fixed';
							}
						} else {
							absTop = top = footerOffsetTop - parentOffset.top - dockOuterHeight;
							position = 'absolute';
						}
						docked = true;
						dockWrapper.css({
							position: position,
							top: top + 'px',
							width: placeholder.width() + 'px'
						});
						lastScroll = scrollTop;
					} else if (!shouldBeFixed && docked) {
						placeholder.hide().css('height', '0px');
						docked = false;
						dockWrapper.css({
							position: defaults.position,
							top: defaults.top,
							width: defaults.width
						});
					}
				},
				getFooterTop = function () {
					var footerTop = -1;
					footers.each(function () {
						var footer = $(this);
						if (footer.is(':visible')) {
							var offset = footer.offset();
							if (footerTop == -1 || offset.top < footerTop) {
								footerTop = offset.top;
							}
						}
					});
					return footerTop;
				}

			function reflow() {
				var newHeight = $(window).height();
				if (lastWindowHeight != newHeight) {
					lastWindowHeight = newHeight;
					if (docked) {
						var parentOffset = dockWrapper.parent().offset();
						var headerOffsetTop = $(window).height() - availableHeight;

						lastScroll = jGlobal.scrollTop();
						absTop = lastScroll - (parentOffset.top - headerOffsetTop);
						scrollOffset = 0;
					}
					reposition();
				}
			}

			jGlobal
				.on('scroll', throttle(function () {
					reposition();
				}))
				.on('resized', reflow);

			$.telligent.evolution.messaging.subscribe('reflow.reflowend', reflow);

			$.telligent.evolution.messaging.subscribe('window.scrollableheight', function (data) {
				if (availableHeight != data.height) {
					availableHeight = data.height;
					if (docked) {
						var parentOffset = dockWrapper.parent().offset();
						var headerOffsetTop = $(window).height() - availableHeight;

						lastScroll = jGlobal.scrollTop();
						absTop = lastScroll - (parentOffset.top - headerOffsetTop);
						scrollOffset = 0;
					}
					reposition();
				}
			});

			reposition();
		});
	};
	$.extend($.fn.evolutionDock, {
		defaults: {
			footers: ('.footer-fragments-header, ' +
				'.footer-fragments, ' +
				'.footer-fragments-footer, ' +
				'.content-fragment-page ' +
				'.layout-region.footer')
		}
	});

})(jQuery, window);

// override pager UI component
$.fn.evolutionPager.defaults = $.extend({}, $.fn.evolutionPager.defaults, {
	showFirst: true,
	showLast: true,
	showNext: true,
	showPrevious: true,
	showIndividualPages: true,
	numberOfPagesToDisplay: 5,
	template: '' +
		' <% if(links && links.length > 0) { %> ' +
		'   <% if($.grep(links, function(l){ return l.type === "previous"; }).length > 0) { %> ' +
		' 	  <a class="previous" data-type="previous" data-page="<%= $.grep(links, function(l){ return l.type === "previous"; })[0].page %>" href="<%: $.grep(links, function(l){ return l.type === "previous"; })[0].url %>">&lt;</a> ' +
		'   <% } else { %> ' +
		' 	  <a class="previous disabled" href="#">&lt;</a> ' +
		'   <% } %> ' +
		'   <div class="ends"> ' +
		' 	  <div> ' +
		' <% foreach(links, function(link, i) { %> ' +
		'     <% if(link.type === "first") { %> ' +
		'         <a href="<%: link.url %>" class="first" data-type="first" data-page="<%= link.page %>" data-selected="false"><span>&#171;</span></a> ' +
		'     <% } else if(link.type === "page") { %> ' +
		'         <a href="<%: link.url %>" class="page<%= link.selected ? " selected" : "" %>" data-type="page" data-page="<%= link.page %>" data-selected="<%= link.selected ? "true" : "false" %>"><span><%= link.page %></span></a> ' +
		'     <% } else if(link.type === "last") { %> ' +
		'         <a href="<%: link.url %>" class="last" data-type="last" data-page="<%= link.page %>" data-selected="false"><span>&#187;</span></a> ' +
		'     <% } %> ' +
		' <% }); %> ' +
		'     </div> ' +
		'   </div> ' +
		'   <% if($.grep(links, function(l){ return l.type === "next"; }).length > 0) { %> ' +
		'   	<a class="next" data-type="next" data-page="<%= $.grep(links, function(l){ return l.type === "next"; })[0].page %>" href="<%: $.grep(links, function(l){ return l.type === "next"; })[0].url %>">&gt;</a> ' +
		'   <% } else { %> ' +
		'   	<a class="next disabled" href="#">&lt;</a> ' +
		'   <% } %> ' +
		' <% } %> '
});

(function ($, global, undef) {

	function showLoadingIndicator(container, mask) {
		var containerOffset = container.offset();
		mask.hide().appendTo('body').css({
			width: container.width(),
			height: container.height(),
			top: containerOffset.top,
			left: containerOffset.left
		}).show();
	}

	var recentlyLoaded = true;
	setTimeout(function () {
		recentlyLoaded = false;
	}, 2000);

	function hideLoadingIndicator(container, mask) {
		mask.hide();
	}

	function buildMask() {
		return $('<div></div>').css({
			backgroundColor: '#fff',
			position: 'absolute',
			opacity: .75,
			zIndex: 1
		});
	}

	var ajaxPagerContexts = {};
	$.telligent.evolution.ui.components.page = {
		setup: function () {

		},
		add: function (elm, options) {
			// general settings
			var settings = {
				currentPage: parseInt(options.currentpage, 10),
				pageSize: parseInt(options.pagesize, 10),
				totalItems: parseInt(options.totalitems, 10),
				showPrevious: typeof options.configuration.ShowPrevious === 'undefined' ? true : options.configuration.ShowPrevious === 'true',
				showNext: typeof options.configuration.ShowNext === 'undefined' ? true : options.configuration.ShowNext === 'true',
				showIndividualPages: typeof options.configuration.ShowIndividualPages === 'undefined' ? true : options.configuration.ShowIndividualPages === 'true',
				pageKey: options.pagekey,
				hash: options.configuration.Target,
				baseUrl: options.configuration.BaseUrl || window.location.href,
				template: typeof options.configuration.Template !== 'undefined' ? options.configuration.Template : $.fn.evolutionPager.defaults.template
			};
			// ajax-specific options
			if (options.pagedcontenturl) {
				ajaxPagerContexts[options.pagedcontentpagingevent] = {
					onPage: function (pageIndex, complete, hash) {
						var contentContainer = $('#' + options.pagedcontentwrapperid),
							body = $('html,body');

						var data = hash || {};
						data[options.pagekey] = pageIndex;
						// modify the url instead of passing as data, as the url might have this in the querystring already
						var url = $.telligent.evolution.url.modify({
							url: options.pagedcontenturl,
							query: data
						});
						$.telligent.evolution.get({
							url: url,
							cache: false,
							success: function (response) {
								complete(response);
								// if host page just loaded, don't bother scrolling pageable area
								if (recentlyLoaded)
									return;
								// scroll to top of paging area after page if out of view
								var top = contentContainer.offset().top - 160;
								var scrollTop = 0;
								body.each(function (i, e) {
									if (e.scrollTop && e.scrollTop > scrollTop) {
										scrollTop = e.scrollTop;
									}
								});
								if (scrollTop > top) {
									body.animate({
										scrollTop: top
									}, 250);
								}
							}
						});
					}
				};
				$.extend(settings, {
					onPage: function (pageIndex, complete, hash) {
						ajaxPagerContexts[options.pagedcontentpagingevent].onPage(pageIndex, complete, hash);
					},
					refreshOnAnyHashChange: (options.loadonanyhashchange === 'true'),
					pagedContentContainer: '#' + options.pagedcontentwrapperid,
					pagedContentPagingEvent: options.pagedcontentpagingevent,
					pagedContentPagedEvent: options.pagedcontentpagedevent,
					transition: options.configuration.Transition,
					transitionDuration: typeof options.configuration.TransitionDuration === 'undefined' ? 200 : parseInt(options.configuration.TransitionDuration, 10)
				});
			}
			$(elm).evolutionPager(settings);

			if (options.loadingindicator === 'true') {
				var container = $('#' + options.pagedcontentwrapperid),
					mask = buildMask();
				$.telligent.evolution.messaging.subscribe(options.pagedcontentpagingevent, function () {
					showLoadingIndicator(container, mask);
				});
				$.telligent.evolution.messaging.subscribe(options.pagedcontentpagedevent, function () {
					hideLoadingIndicator(container, mask);
				});
			}
		}
	};

})(jQuery, window);

// moderation UI component override
(function ($, global, undef) {

	function addAbuseReport(contentId, contentTypeId) {
		return $.telligent.evolution.post({
			url: $.telligent.evolution.site.getBaseUrl() + 'api.ashx/v2/abusereports.json',
			data: {
				ContentId: contentId,
				ContentTypeId: contentTypeId
			},
			cache: false,
			dataType: 'json'
		});
	}

	function show(elm) {
		return elm.css({
			display: 'block'
		});
	}

	function hide(elm) {
		return elm.css({
			display: 'none'
		});
	}

	$.telligent.evolution.ui.components.moderate = {
		setup: function () {},
		add: function (elm, options) {
			if (options.supportsabuse === 'false') {
				elm.remove();
				return;
			}
			elm.removeClass('ui-moderate').empty();
			var flagLink = hide($('<a href="#">' + $.telligent.evolution.ui.components.moderate.defaults.flagText + '</a>').appendTo(elm));
			var changing = hide($('<a href="#">…</a>').appendTo(elm));
			var flaggedState = hide($('<a href="#">' + $.telligent.evolution.ui.components.moderate.defaults.flaggedText + '</a>').appendTo(elm));

			// if already flagged, show that instead of the link
			if (options.initialstate == 'true') {
				show(flaggedState).on('click', function (e) {
					return false;
				});
			} else {
				show(flagLink).on('click', function (e) {
					e.preventDefault();
					e.stopPropagation();
					$.fn.uilinks.hide();
					// when tapped, show the 'changing' state
					show(changing);
					hide(flagLink);
					// and submit the abuse report
					addAbuseReport(options.contentid, options.contenttypeid).then(function () {
						// switch to the 'flagged' link state
						show(flaggedState);
						hide(changing);
						// raise ui.reportabuse message
						$.telligent.evolution.messaging.publish('ui.reportabuse', {
							contentId: options.contentid,
							contentTypeId: options.contenttypeid
						});
						// show a message
						$.telligent.evolution.notifications.show($.telligent.evolution.ui.components.moderate.defaults.reportedText, {
							duration: $.telligent.evolution.ui.components.moderate.defaults.duration
						});
					});
				});
			}
		}
	};
	$.telligent.evolution.ui.components.moderate.defaults = {
		reportedText: 'Thank you for your report',
		flagText: 'Flag as spam/abuse',
		flaggedText: 'Flagged as spam/abuse',
		duration: 5 * 1000
	};

})(jQuery, window);


// resize overload
(function ($, global, undef) {

	var resize = function (context) {
		context.area.css({
			height: 'auto'
		});

		var newHeight = context.area.prop('scrollHeight');
		if (newHeight < context.minHeight)
			newHeight = context.minHeight;

		context.area.css({
			height: newHeight
		});

		newHeight = (context.area.outerHeight(true));

		if (newHeight !== context.oldHeight) {
			context.area.css({
				overflow: 'hidden'
			});
			context.area.trigger('evolutionResize', {
				newHeight: newHeight,
				oldHeight: context.oldHeight
			});
			context.oldHeight = newHeight;
		}
	};

	$.fn.evolutionResize = function (options) {
		var settings = $.extend({}, $.fn.evolutionResize.defaults, options || {});
		return this.filter('textarea').each(function () {
			var area = $(this)
				.css({
					width: '100%',
					resize: 'none',
					overflow: 'hidden'
				});
			var context = {
				area: area,
				oldHeight: area.height(),
				minHeight: area.outerHeight()
			};
			area.on('input', function () {
				resize(context);
			});
			resize(context);
		});
	};
	$.fn.evolutionResize.defaults = {
		maxLength: 250
	};

})(jQuery, window);

// evolutionHighlight
(function ($, global, undef) {

	var highlighterKey = '_HIGHLIGHTER_CONTEXT',
		getContext = function (selection, options) {
			var context = selection.data(highlighterKey);
			if (typeof context === 'undefined' || context === null) {
				context = buildContext(selection, options);
				selection.data(highlighterKey, context);
			}
			return context;
		},
		buildContext = function (selection, options) {
			var area = selection.filter('textarea');
			var context = {
				selection: area,
				settings: $.extend({}, $.fn.evolutionHighlight.defaults, options || {}),
				verticalPadding: parseInt(area.css('padding-top') || '0', 10) + parseInt(area.css('padding-bottom') || '0', 10),
				horizontalPadding: parseInt(area.css('padding-left') || '0', 10) + parseInt(area.css('padding-right') || '0', 10) + parseInt(area.css('border-left') || '0', 10) + parseInt(area.css('border-right') || '0', 10)
			};
			buildHighlightingContainer(context);
			return context;
		},
		buildHighlightingContainer = function (context) {
			context.wrapper = $('<div></div>');
			context.mirror = $('<div></div>');

			// remove margins from textarea and apply to wrapper
			var wrapperStyle = {
				position: 'relative',
				width: context.selection.outerWidth(true),
				height: context.selection.outerHeight(true) + 2
			};
			$.each(['margin-left', 'margin-right', 'margin-top', 'margin-bottom'], function (i, styleName) {
				wrapperStyle[styleName] = context.selection.css(styleName);
				context.selection.css(styleName, 0);
			});

			// capture textarea styles to apply to mirror
			var mirrorStyle = {
				position: 'absolute',
				top: '0px',
				left: '0px',
				zIndex: '0',
				borderTopColor: 'transparent',
				borderBottomColor: 'transparent',
				borderLeftColor: 'transparent',
				borderRightColor: 'transparent',
				backgroundColor: context.selection.css('backgroundColor'),
				color: 'transparent',
				width: context.selection.outerWidth(),
				height: context.selection.outerHeight(),
				overflow: 'hidden',
				whiteSpace: 'normal'
			};
			$.each(context.settings.styles, function (i, styleName) {
				mirrorStyle[styleName] = context.selection.css(styleName);
			});

			// new styles to apply to text area
			var textAreaStyle = {
				position: 'absolute',
				top: '0px',
				left: '0px',
				zIndex: '1',
				backgroundColor: 'transparent',
				width: context.selection.outerWidth(),
				height: context.selection.outerHeight()
			};

			// apply styles
			context.wrapper.css(wrapperStyle).addClass('highlighter');
			context.mirror.css(mirrorStyle);
			context.selection.css(textAreaStyle);

			// set background-color
			context.mirror.css('color', context.mirror.css('background-color'));

			// rearrange DOM
			context.selection.before(context.wrapper);
			context.wrapper.append(context.selection);
			context.wrapper.append(context.mirror);

			context.mirror.css({
				width: context.selection.outerWidth(true) + context.horizontalPadding,
				height: context.selection.outerHeight(true) + context.verticalPadding
			})
		},
		rDoubleSpace = /\s\s/gi,
		rBreak = /\n/gi,
		encodeSymbols = {
			'&': '&amp;',
			'>': '&gt;',
			'<': '&lt;',
			'"': '&quot;',
			"'": '&#39;'
		},
		highlight = function (context) {
			// prepare highlights
			var ranges = {};
			$.each(context.settings.ranges, function (i, range) {
				ranges[range.start] = ranges[range.start] || [];
				ranges[range.start].push(range);
				ranges[range.stop] = ranges[range.stop] || [];
				ranges[range.stop].push(range);
			});

			var rawValue = $.telligent.evolution.html.encode(context.selection.val());
			newValue = [],
				spanDepth = 0;
			for (var i = 0; i < rawValue.length; i++) {
				if (typeof ranges[i] !== 'undefined') {
					$.each(ranges[i], function (h, range) {
						if (range.start === i) {
							newValue[newValue.length] = '<span class="' + range.className + '" style="white-space:normal;">';
							spanDepth++;
						} else {
							newValue[newValue.length] = '</span>';
							spanDepth--;
						}
					});
				}
				newValue[newValue.length] = encodeSymbols[rawValue.charAt(i)] ? encodeSymbols[rawValue.charAt(i)] : rawValue.charAt(i);
			}
			if (spanDepth > 0) {
				newValue[newValue.length] = '</span>';
			}
			var newRawValue = newValue.join('').replace(rBreak, '<br />').replace(rDoubleSpace, '&nbsp; ');
			// not using .html() as it executes js.  Not using .innerHTML directly on mirror as it errors in IE
			var mirroredValueWrapper = document.createElement('span');
			mirroredValueWrapper.innerHTML = newRawValue;
			context.mirror.empty().get(0).appendChild(mirroredValueWrapper);
		};
	var methods = {
		init: function (options) {
			var context = getContext(this, options);
			context.settings = $.extend({}, $.fn.evolutionHighlight.defaults, options || {});
			highlight(context);
			return this;
		},
		clear: function () {
			var context = getContext(this, null);
			if (context === null)
				return;
			context.mirror.html('');
			return this;
		},
		resize: function (width, height) {
			var context = getContext(this, null);
			if (context === null)
				return;
			var newStyle = {
				width: width + context.horizontalPadding,
				height: height + context.verticalPadding
			};
			context.mirror.css(newStyle);
			context.selection.css(newStyle);
			context.wrapper.css({
				width: context.selection.width() + context.horizontalPadding,
				height: context.selection.height() + context.verticalPadding + 4
			});
			return this;
		},
		css: function (css) {
			var context = getContext(this, null);
			if (context === null)
				return;
			context.wrapper.css(css);
			return this;
		}
	};
	$.fn.evolutionHighlight = function (method) {
		if (methods[method]) {
			return methods[method].apply(this, Array.prototype.slice.call(arguments, 1));
		} else if (typeof method === 'object' || !method) {
			return methods.init.apply(this, arguments);
		} else {
			$.error('Method ' + method + ' does not exist on jQuery.evolutionHighlight');
		}
	};
	$.fn.evolutionHighlight.defaults = {
		ranges: [],
		styles: ['border-top-width', 'border-top-style', 'border-bottom-width',
			'border-bottom-style', 'border-right-width', 'border-right-width-value',
			'border-right-style', 'border-right-style-value', 'border-left-width',
			'border-left-width-value', 'border-left-style', 'border-left-style-value',
			'font-family', 'font-size', 'font-size-adjust', 'font-stretch',
			'font-style', 'font-variant', 'font-weight',
			'padding-bottom', 'padding-left', 'padding-right', 'padding-top',
			'letter-spacing', 'line-height', 'text-align', 'text-indent', 'word-spacing'
		]
	};

})(jQuery, window);

// override search result UI component
(function ($) {
	$.telligent.evolution.ui.components.searchresult = {
		setup: function () {},
		add: function (elm) {}
	};
})(jQuery);


// override for liker template
(function ($) {

	$.fn.evolutionLike.defaults.likersTemplate = '' +
		' <% foreach(likers, function(liker) { %> ' +
		'     <li class="content-item"> ' +
		'         <div class="full-post-header"></div> ' +
		'         <div class="full-post"> ' +
		'             <span class="avatar"> ' +
		'                 <a href="<%: liker.profileUrl %>"  class="internal-link view-user-profile"> ' +
		'                     <% if(liker.avatarHtml) { %> ' +
		'                         <%= liker.avatarHtml %> ' +
		'                     <% } else { %> ' +
		'                         <img src="<%: liker.avatarUrl %>" alt="" border="0" width="32" height="32" style="width:32px;height:32px" /> ' +
		'                     <% } %> ' +
		'                 </a> ' +
		'             </span> ' +
		'             <span class="user-name"> ' +
		'                 <a href="<%: liker.profileUrl %>" class="internal-link view-user-profile"><%= liker.displayName %></a> ' +
		'             </span> ' +
		'         </div> ' +
		'         <div class="full-post-footer"></div> ' +
		'     </li> ' +
		' <% }); %> ';

})(jQuery);

// override defaults
(function ($) {
	$.fn.glowUpload.defaults.width = '80%';
	$.fn.evolutionStarRating.defaults.starElement = 'span'
})(jQuery);


// adjust tables to be scrollable if they are larger than the content width and available height
(function ($) {
	var maxHeight = 400,
		checkResize = function () {
			$('.content-fragment-content .content .content .content-scrollable-wrapper, .user-defined-markup .content-scrollable-wrapper').each(function () {
				var w = $(this);
				var sw = w.prop('scrollWidth') || w.width();
				if (sw > w.outerWidth()) {
					w.addClass('content-scrollable-wrapper-scrolled').css('max-height', (maxHeight * .8) + 'px');
				} else {
					w.removeClass('content-scrollable-wrapper-scrolled').css('max-height', 'none');
				}
			});
		},
		detectElements = function () {
			$('.content-fragment-content .content .content table, .content-fragment-content .content .content pre, .user-defined-markup table, .user-defined-markup pre').each(function () {
				var t = $(this);
				if (t.parents('.content-scrollable-wrapper').length == 0) {
					t.wrap('<div class="content-scrollable-wrapper" style="max-width: 100%; overflow: auto;"></div>');
				}
			});
		};

	$.telligent.evolution.messaging.subscribe('window.scrollableheight', function (data) {
		maxHeight = data.height;
		checkResize();
	});

	$(function () {
		var mutationTimeout;
		$('body').on('mutate', function () {
			clearTimeout(mutationTimeout);
			mutationTimeout = setTimeout(function () {
				detectElements();
				checkResize();
			}, 500);
		});

		detectElements();
		checkResize();
	});
})(jQuery);

// adjust iframe based embeddable scripts to be scrollable if they are larger than the content width and available height
(function ($) {

	function throttle(handler) {
		if (!window.requestAnimationFrame)
			return handler;
		var timeout;
		return function () {
			if (timeout)
				window.cancelAnimationFrame(timeout);
			timeout = window.requestAnimationFrame(handler);
		};
	}

	$(function () {
		var $allVideos = $('.resizable-embeddablescript iframe')
		$allVideos.each(function () {
			$(this).data('aspectRatio', this.height / this.width)
				.removeAttr('height')
				.removeAttr('width');
		});

		var maxHeight = 0;
		var resizeEnd;

		var resizeEmbeddableIframes = function () {
			clearTimeout(resizeEnd);
			resizeEnd = setTimeout(function () {
				$allVideos.each(function () {
					var $el = $(this);
					var parent = $el.closest('.content-fragment-content');

					var newWidth = parent.width();
					var newHeight = parent.width() * $el.data('aspectRatio');

					if (maxHeight > 0 && newHeight > maxHeight) {
						newHeight = maxHeight;
						newWidth = maxHeight / $el.data('aspectRatio')
					}

					$el.width(newWidth).height(newHeight);
				});
			}, 100);
		};

		$.telligent.evolution.messaging.subscribe('window.scrollableheight', function (data) {
			maxHeight = data.height;

			resizeEmbeddableIframes();
		});

		$(window).on('resized', throttle(function () {
			resizeEmbeddableIframes();
		})).trigger('resize');
	});

})(jQuery);

// position notifications in top right, with long error durations
(function ($) {
	$.extend($.telligent.evolution.notifications.defaults, {
		errorDuration: 60 * 1000,
		verticalOffset: 45,
		horizontalOffset: 5,
		placement: 'topright'
	});
})(jQuery);