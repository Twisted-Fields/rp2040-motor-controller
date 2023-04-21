(function($, global, undef) {

	var administrationContextManager = $.telligent.evolution.administration.__contextManager,
		messaging = $.telligent.evolution.messaging,
		registered = false,
		transitionEasing = 'cubic-bezier(0.645, 0.045, 0.355, 1)',
		transitionDuration = 300,
		autoHideTimeout = 250,
		isRightToLeft = $('html').hasClass('direction-rtl');
		events = {
			shellOpen: 'context.shell.open',
			shellClosed: 'context.shell.closed',
			rendered: '__panel_rendered'
		},
		panelTypes = {
			'root': 0,
			'category': 1,
			'panel': 2
		},
		handlingAutoHidingEvents = false;

	function initUi(context) {
		// add initial categories UI
		context.rootCategories = $($.telligent.evolution.template.compile(context.rootCategoriesTemplateId)());

		if(context.supportsExplicitOnly)
			return;

		context.rootCategories.css({ 'visibility': 'hidden' }).appendTo('body');

		var collapsedStyle = {
			width: 32,
			height: 32,
			opacity: .8,
			'border-radius': 300
		};

		context.rootCategories
			.css(collapsedStyle)
			.addClass('collapsed')
			.css({ 'visibility': 'visible' });

		context.previewPanelContext = PanelRequest.deserialize($.telligent.evolution.url.parseQuery((context.previewPanelUrl || '').replace(/#/,'')));
	}

	function handleEvents(context) {
		// entering/exiting shell
		if(!context.supportsExplicitOnly) {
			function openRoot() {
				window.location.href = context.rootPanelUrl;
			}

			context.rootCategories
				.on('mouseenter', function() {
					$(this).addClass('with-loader');
				})
				.on('glowDelayedMouseEnter', 250, function(){
					if(!context.justExplicitlyClosed) {
						openRoot();
					}
				})
				.on('click', function() {
					openRoot();
					return false;
				});

			// gesture based entrance
			// only open on swipe if not the result of a mouse-based swipe, was a right swipe,
			// not currently open, has any items to open, and page did not scroll very much during the swipe
			var scrollY, scrollDiff;
			$(document).on({
				panstart: function(e) {
					scrollY = global.scrollY;
				},
				panend: function(e) {
					scrollDiff = global.scrollY - scrollY;
					scrollY = global.scrollY;
				},
				swiperight: function(e) {
					if(e.originalEvent &&
						e.originalEvent.originalEvent &&
						e.originalEvent.originalEvent.type != 'mouseup' &&
						e.originalEvent.originalEvent.pointerType != 'mouse' &&
						!context.opened &&
						context.hasCategories &&
						Math.abs(scrollDiff) < 44)
					{
						window.location.href = context.rootPanelUrl;
					}
				}
			});
		}

		$.telligent.evolution.messaging.subscribe('contextual.shell.close', function(){
			requestPanelClose(context);
			context.justExplicitlyClosed = true;
			setTimeout(function(){
				context.justExplicitlyClosed = false;
			}, 1000);
		});

		// processing shell navigation
		$(global).on('hashchange', function(){
			processPanelState(context);
		});

		if (context.rootCategories.length > 0) {
			var renderedSubscriptionId;
			$.telligent.evolution.shortcuts.register('shift + esc', function(){
				if (!context.opened) {
					$.telligent.evolution.shortcuts.captureFocus();
					if (renderedSubscriptionId)
						messaging.unsubscribe(renderedSubscriptionId);
					renderedSubscriptionId = messaging.subscribe(events.rendered, function() {
						messaging.unsubscribe(renderedSubscriptionId);
						enterSearchMode(context);
					});

					openRoot();
				} else {
					requestPanelClose(context)
					$.telligent.evolution.shortcuts.refocus();
				}
				return false;
			}, { description: context.manageCommunityText });
		}
	}

	// determine if a panel should be requested,
	// and requests if necessary
	function processPanelState(context) {
		var panelRequest = PanelRequest.deserialize($.telligent.evolution.url.hashData());

		// could be handled by any of the currently loaded admin contexts (sub panel of current or hidden stack)
		if(context.administrationContextManager && context.administrationContextManager.canProcessHash()) {
			context.administrationContextManager.processHash();
		// completely different panel type
		} else if(differsFromCurrentPanel(context, panelRequest)) {
			loadAndRenderContextualPanelRequest(context, panelRequest);
		} else {
			closePanel(context);
		}
	}

	// Returns whether a panel request differs from
	// a currently-viewed panel, if one exists
	function differsFromCurrentPanel(context, panelRequest) {
		// if this is not even a panel request, ignore
		if(!panelRequest || !panelRequest.type)
			return false;

		// if there's no current panel state, then it's already effectively different
		if(!context.currentPanelRequest)
			return true;

		// this is for a different panel type
		if(context.currentPanelRequest.type !== panelRequest.type)
		{
			return true;
		}

		// this is for a different category panel than the current category
		if(context.currentPanelRequest.type == 'category' && (
			(context.currentPanelRequest.contextType !== panelRequest.contextType) ||
			(context.currentPanelRequest.contextId !== panelRequest.contextId)
		))
		{
			return true;
		}

		// this is for a different panel than the current panel
		if(context.currentPanelRequest.type == 'panel' &&
			(
				context.currentPanelRequest.panelId !== panelRequest.panelId ||
				context.currentPanelRequest.contextType !== panelRequest.contextType
			)
		)
		{
			return true;
		}

		return false;
	}

	function initAdminContextManager(context) {
		context.administrationContextManager = new administrationContextManager({
			template: $.telligent.evolution.template.compile(context.customPanelTemplateId),
			onOpening: function(options){
				showLoading(context, options);
			},
			onOpened: function() {
				hideLoading(context);
			},
			onRendering: function(node) {
				hideHeaderControls(context, node);
			},
			onRendered: function(node) {
				showHeaderControls(context, node, true);
			},
			onCloseAll: function() {
				requestPanelClose(context);
			},
			onShow: function() {
				context.overShade = false;
				context.overPanel = true;
				maximizePanels(context);
			},
			onHide: function() {
				context.overPanel = false;
				minimizePanels(context);
			},
			onResize: function(size) {
				context.container
					.removeClass('panel-container-normal panel-container-wide panel-container-full')
					.addClass('panel-container-' + size);
				// can't rely on classes alone for target width as getComputedStyle() is live against transitions
				switch(size) {
					case 'full':
						return $(global).width();
						break;
					case 'wide':
						return 800;
						break;
					case 'normal':
					default:
						return 400;
				}
			},
			transitionEasing: transitionEasing,
			transitionDuration: transitionDuration,
			buildScrollingIndicator: function() {
				return $($.telligent.evolution.template.compile(context.loadingIndicatorTemplateId)());
			},
			onNavigateBackToPreviousContext: function(panelNode, options) {
				if(context.currentPanelNode !== panelNode) {

					context.loadingPanel = true;

					var oldContent = context.currentPanelNode;

					hideHeaderControls(context, oldContent, true);

					// slide old content to right
					context.currentPanelNode
						.evolutionTransform({
							left: (isRightToLeft ? -1 : 1) * context.currentPanelNode.outerWidth(true)// + 20
						}, {
							duration: transitionDuration,
							easing: transitionEasing,
							complete: function() {
								setTimeout(function(){
									oldContent.remove();
								}, transitionDuration);
							}
						});

					if(options.onPreRender) {
						options.onPreRender(panelNode);
					}

					// slide in new content
					panelNode.css({
							position: 'absolute',
							top: 0,
							width: context.container.width(),
							height: context.container.height()
						})
						.appendTo(context.container)

					showHeaderControls(context, panelNode, true);

					context.currentPanelNode = panelNode;

					if(options.onRendered) {
						options.onRendered(panelNode);
					}

					panelNode
						.evolutionTransform({ left: (isRightToLeft ? 1 : -1) * context.container.width() }, { duration: 0 })
						.evolutionTransform({ left: 0  }, { duration: transitionDuration, easing: transitionEasing,
							complete: function(){
								completeAnimationStateAndRunAnyDelayedOpen(context);
							}
						});

					// hide any tips
					$.fn.evolutionTip.hide();

				}

			}
		})
	}

	function loadAndRenderContextualPanelRequest(context, panelRequest, forceRefresh) {
		if(context.currentPanelRequest)
			context.previousPanelRequest = context.currentPanelRequest;
		context.currentPanelRequest = currentPanelRequest = panelRequest;

		maximizePanels(context);
		showLoading(context);

		loadContextualPanel(context, panelRequest)
			.then(function(panelResult){
				hideLoading(context);
				// avoid panel loading race conditions
				if(currentPanelRequest !== panelRequest)
					return;

				// entry into a new explicit panel while already in another admin panel context
				if (context.administrationContextManager.count() > 0 && panelRequest.contextType == 'Explicit') {
					if (forceRefresh) {
						context.currentPanelNode = context.administrationContextManager.currentPanelNode();
						 var previousPanelDetails = context.administrationContextManager.previousPanelDetails();
						 // use the current context's back name/url
						 if(previousPanelDetails) {
							 panelResult.backUrl = previousPanelDetails.url;
							 panelResult.backLabel = previousPanelDetails.name;
						 }
					} else {
						var previousPanelRequest = context.administrationContextManager.currentPanelRequest();
						context.currentPanelNode = context.administrationContextManager.currentPanelNode();
						var previousPanelDetails = context.administrationContextManager.currentPanelDetails();
						// use the current context's back name/url
						if(previousPanelDetails) {
							panelResult.backUrl = previousPanelDetails.url;
							panelResult.backLabel = previousPanelDetails.name;
						}
					}
				} else {
					diposeOfAdminContext(context, forceRefresh)
				}

				renderPanel(context, {
					request: panelRequest,
					rawResult: panelResult,
					onPreRender: function(panelNode) {
						if(panelResult.type === 'panel') {
							context.administrationContextManager.addContext({
								panelRequest: panelRequest,
								container: context.container,
								panelNode: panelNode,
								panelName: panelResult.name,
								panelId: panelResult.panelId,
								onRefresh: function() {
									loadAndRenderContextualPanelRequest(context, panelRequest, true);
								},
								onDispose: function() {
									if(previousPanelRequest) {
										context.currentPanelRequest = previousPanelRequest;
									}
								}
							})
						}
					},
					onRendered: function() {
						if(panelResult.type === 'panel') {
							context.administrationContextManager.postInit();
						}
						messaging.publish(events.rendered);
					}
				});

			})
			.catch(function(xhr) {
				hideLoading(context);

				// avoid panel loading race conditions
				if(currentPanelRequest !== panelRequest)
					return;

				diposeOfAdminContext(context, forceRefresh);

				context.currentPanelRequest = context.previousPanelRequest;
				global.history.back();

				if (xhr && xhr.responseText) {
					var response = $.isPlainObject(xhr.responseText) ?  xhr.responseText : JSON.parse(xhr.responseText);
					if (response && response.error && !response.loggedIn) {
						global.location.reload(true);
					}
				}
			});
	}

	function loadContextualPanel(context, panelRequestData) {
		var urlData = $.telligent.evolution.url.parseQuery(window.location.href + '');
		if (urlData._cpdefault) {
			var returnUrl = urlData._cpreturnurl;
			if (!returnUrl) {
				returnUrl = $.telligent.evolution.url.modify({
						query: {
							_cpdefault: '_cpdefault'
						}
				}).replace('_cpdefault=_cpdefault', '');
				if (returnUrl.substr(returnUrl.length - 1) == '#') {
					returnUrl = returnUrl.substr(0, returnUrl.length - 1);
				}
				if (returnUrl.substr(returnUrl.length - 1) == '?') {
					returnUrl = returnUrl.substr(0, returnUrl.length - 1);
				}
				panelRequestData = $.extend({}, panelRequestData, {
					_cpreturnurl: returnUrl
				});
			}
		}

		return $.telligent.evolution.get({
			url: context.loadUrl,
			data: panelRequestData
		});
	}

	function searchPanels(context, query) {
		return $.telligent.evolution.get({
			url: context.searchUrl,
			data: {
				query: query
			}
		});
	}

	function showShade(context) {
		if(!context.shade) {
			context.shade = $('<div class="contextual-administration-panel-shade"></div>')
				.css({
					opacity: 0,
					display: 'none'
				});
			$('body').append(context.shade);
		}
		context.shade.css({
			display: 'block'
		}).evolutionTransform({ opacity: 1 }, {
			duration: transitionDuration,
			easing: transitionEasing
		});
	}

	function hideShade(context) {
		if(!context.shade)
			return;

		context.shade.css({

		}).evolutionTransform({ opacity: 0 }, { duration: transitionDuration, easing: transitionEasing, complete: function(){
			if (context.shade) {
				context.shade.css({
					display: 'none'
				});
			}
		}});
	}

	function showLoading(context, options) {
		if(context.container) {
			if(!context.loadingIndicator || context.loadingIndicator.length === 0) {
				context.loadingIndicator = $($.telligent.evolution.template.compile(context.panelLoadingIndicatorTemplateId)()).appendTo(context.container);
			}
			context.loadingIndicator
				.css({ opacity: 0 })
				.show()
				.evolutionTransform({ opacity: .9 }, { duration: transitionDuration / 2 })
			if(context.currentPanelNode)
				hideHeaderControls(context, context.currentPanelNode);
		} else {
			context.rootCategories.addClass('with-loader');
		}
	}

	function hideLoading(context) {
		if(context.loadingIndicator) {
			context.loadingIndicator
				.evolutionTransform({ opacity: 0 }, { duration: transitionDuration / 2, complete: function(){
					context.loadingIndicator.hide();
				}})
			if(context.currentPanelNode)
				showHeaderControls(context, context.currentPanelNode);
		}
		context.rootCategories.removeClass('with-loader');
	}

	function showHeaderControls(context, panelNode, animate) {
		if(animate) {
			$(panelNode).find('.contextual-panel-heading .back, .contextual-panel-heading .close')
				.evolutionTransform(
					{ opacity: 1 },
					{ duration: transitionDuration, easing: transitionEasing });
		} else {
			$(panelNode).find('.contextual-panel-heading .back, .contextual-panel-heading .close').css({
				opacity: 1
			});
		}
	}

	function hideHeaderControls(context, panelNode, animate) {
		if(animate) {
			$(panelNode).find('.contextual-panel-heading .back, .contextual-panel-heading .close')
				.evolutionTransform(
					{ opacity: 0 },
					{ duration: transitionDuration, easing: transitionEasing });
		} else {
			$(panelNode).find('.contextual-panel-heading .back, .contextual-panel-heading .close').css({
				opacity: 0
			});
		}
	}

	function minimizePanels(context) {
		if(context.container) {
			if (isRightToLeft) {
				context.container.evolutionTransform({
					right: -1 * context.container.width() + 35
				}, {
					duration: transitionDuration,
					easing: transitionEasing
				});
			} else {
				context.container.evolutionTransform({
					left: -1 * context.container.width() + 35
				}, {
					duration: transitionDuration,
					easing: transitionEasing
				});
			}
		}
		hideShade(context);
	}

	function maximizePanels(context) {
		if(context.container) {
			if (isRightToLeft) {
				context.container.evolutionTransform({
					right: 0
				}, {
					duration: transitionDuration,
					easing: transitionEasing
				});
			} else {
				context.container.evolutionTransform({
					left: 0
				}, {
					duration: transitionDuration,
					easing: transitionEasing
				});
			}
			showShade(context);
		}
	}

	function requestPanelClose(context) {
		history.pushState("", document.title, window.location.pathname + window.location.search);
		processPanelState(context);
	}

	function doesContainerCoverWidgets(context) {
		var containerWidth = context.container.width();
		var allWidgets = $('.content-fragment');
		var widget;
		for(var i = 0; i < allWidgets.length; i++) {
			widget = $(allWidgets[i]);
			if(widget.offset().left <= containerWidth && widget.is(':visible')) {
				return true;
			}
		}
		return false;
	}

	function handlePanelAutohiding(context) {
		if(handlingAutoHidingEvents)
			return;

		handlingAutoHidingEvents = true;
		context.overPanel = true;
		context.overShade = false;
		var mouseLeaveTimeout;

		function innerHide(force) {
			if(context.overShade || force) {
				context.overPanel = false;
				var currentRequest = PanelRequest.deserialize($.telligent.evolution.url.hashData());
				var isRoot = currentRequest.type == 'root';
				var isPreviewPanel = (currentRequest.type == context.previewPanelContext.type && currentRequest.panelId == context.previewPanelContext.panelId);

				if(context.interactedWith || !(isRoot || isPreviewPanel)) {
					if(doesContainerCoverWidgets(context)) {
						minimizePanels(context);
					} else {
						hideShade(context);
					}
				} else {
					requestPanelClose(context);
				}
			}
		}

		function hide(force) {
			if(force) {
				innerHide(force);
			} else {
				mouseLeaveTimeout = setTimeout(function(){
					innerHide(force);
				}, autoHideTimeout);
			}
		}

		function show() {
			clearTimeout(mouseLeaveTimeout);
			if(!context.overPanel) {
				context.overShade = false;
				context.overPanel = true;
				maximizePanels(context);
			}
		}

		context.shade.on('mouseenter.contextshell', function(){
			context.overShade = true;
		});
		context.shade.on('mouseleave.contextshell', function(){
			context.overShade = false;
		});
		context.shade.on('click.contextshell', function(){
			context.overPanel = false;
			context.overShade = true;
			hide(true);
		});
		context.container.on('click.contextshell', function(e){
			context.overPanel = true;
			context.overShade = false;
			show();
		});
		context.container.on('mouseleave.contextshell', function(){
			hide();
		});
		context.container.on('mouseenter.contextshell', function(e){
			if(!(
				e.target &&
				(
					(
						$(e.target).is('div.contextual-panel-heading') ||
						$(e.target).closest('div.contextual-panel-heading').length > 0
					) &&
					!(
						($(e.target).is('div.custom-panel-heading-content') ||
						$(e.target).closest('div.custom-panel-heading-content').length > 0)
					)
				)
				))
			{
				show();
			}
		});
	}

	function completeAnimationStateAndRunAnyDelayedOpen(context) {
		context.loadingPanel = false;
		if(context.delayedOpen) {
			var opener = context.delayedOpen;
			delete context.delayedOpen;
			setTimeout(function(){
				opener();
			}, 10);
		}
	}

	function enterSearchMode(context) {
		context.searchInputWrapper = context.container.find('.contextual-panel-heading-search');
		context.resultWrapper = context.container.find('.contextual-panel-content-search-results');
		context.searchInput = context.searchInputWrapper.find('input').first();
		context.searchInputWrapper.evolutionTransform({ opacity: 0 }, { duration: 0 }).show();
		context.searchInput.trigger('focus');
		context.searchInputWrapper.evolutionTransform({ opacity: 1 }, { duration: 125 });
		var searchTimeout;
		var selectedIndex = -1;

		context.searchInput.on('keydown.search', function(e){
			clearTimeout(searchTimeout);
			var currentItems = context.resultWrapper.find('.navigation-list-item');
			// escape
			if(e.which === 27) {
				exitSearchMode(context);
			// up
			} else if(e.which === 38) {
				if(selectedIndex >= 0) {
					$(currentItems.get(selectedIndex)).removeClass('selected');
				}
				selectedIndex--;
				if(selectedIndex < 0) {
					selectedIndex = currentItems.length - 1;
				}
				$(currentItems.get(selectedIndex)).addClass('selected');
				return false;
			// down
			} else if(e.which === 40) {
				if(selectedIndex >= 0) {
					$(currentItems.get(selectedIndex)).removeClass('selected');
				}
				selectedIndex++;
				if(selectedIndex >= currentItems.length) {
					selectedIndex = 0;
				}
				$(currentItems.get(selectedIndex)).addClass('selected');
				return false;
			// enter
			} else if(e.which === 13) {
				if(selectedIndex >= 0) {
					var currentItem = $(currentItems.get(selectedIndex));
					currentItem.addClass('active');
					var targetPanelUrl = currentItem.find('a').first().attr('href');
					if (targetPanelUrl.length > 0) {
						exitSearchMode(context, true);
						window.location = targetPanelUrl;
					}
				}
				return false;
			} else {
				searchTimeout = setTimeout(function(){
					var query = context.searchInput.val();
					if(query.length === 0) {
						context.resultWrapper.empty().hide();
					} else {
						searchPanels(context, query).then(function(r){
							if(context.searchInput.val() == query) {
								var resultContent = $.trim(r.content);
								if(resultContent.length > 0) {
									selectedIndex = -1;
									context.resultWrapper.show().html(resultContent);
								} else {
									selectedIndex = -1;
									context.resultWrapper.empty().hide();
								}
							} else {
								selectedIndex = -1;
								context.resultWrapper.empty().hide();
							}
						});
					}
				}, 150);
			}
		});
	}

	function exitSearchMode(context, immediate) {
		if (immediate) {
			context.searchInputWrapper.hide();
		} else {
			context.searchInputWrapper.evolutionTransform({ opacity: 0 }, { duration: 100, complete: function(){
				context.searchInputWrapper.hide();
			}}).show();
		}
		context.searchInput.off();
		context.searchInputWrapper.find('input').first().val('');
		context.resultWrapper.empty().hide();
	}

	function handleSearching(context) {
		$(context.container).on('click','.search a',function(e){
			e.preventDefault();
			enterSearchMode(context);
			return false;
		});
		$(context.container).on('click','.contextual-panel-heading-search a.exit-search',function(e){
			e.preventDefault();
			exitSearchMode(context);
			return false;
		});
	}

	function handlePanelFilterLinks(context) {
		$(context.container).on('click','a [data-panelfilter]', function(e){
			e.stopPropagation();

			var link = $(this).closest('a');

			// collect data-* items on the panel-filter
			var data = {};
			for(var i = 0; i < this.attributes.length; i++) {
				var attr = this.attributes[i];
				if(attr.name.indexOf('data-') === 0) {
					var name = attr.name.substring(5);
					if(name !== 'panelfilter')
						data[name] = attr.value;
				}
			}

			global.location.href = link.attr('href') + '&' + $.telligent.evolution.url.serializeQuery(data);

			return false;
		});
	}

	/* options
	 * 	 request
	 *   rawResult
	 *   renderedResult
	 *   direction
	 */
	function renderPanel(context, options) {

		// init container if not inited
		if(!context.container) {
			var p = $('body > form');
			if (p.length != 1) {
				p = $('body');
			}
			context.container = $($.telligent.evolution.template.compile(context.panelContainerTemplateId)()).appendTo(p).first();
			handleSearching(context);
			handlePanelFilterLinks(context);
		}

		clearTimeout(context.closingTimeout);

		context.panelTemplate = context.panelTemplate || $.telligent.evolution.template.compile(context.panelTemplateId);
		var panelNode;

		$.telligent.evolution.ui.suppress(function(){
			if(options.onRendered) {
				context.container.one('rendered', function() {
					options.onRendered(panelNode);
				});
			}

			panelNode = $(context.panelTemplate($.extend({
				contentClass: '',
				panelId: options.request.panelId,
				rootPanelId: options.request.panelId,
				namespace: ''
			}, options.rawResult)));
			if(options.rawResult.content && (typeof options.rawResult.content !== "string")) {
				panelNode.find('.contextual-panel-content').first().append(options.rawResult.content)
			}
		});
		hideHeaderControls(context, panelNode);

		// if panel not yet visible, animate in the container
		if(!context.container.is(':visible')) {

			context.interactedWith = false;

			panelNode.one('click', function(e,data){
				if(!data || !data.synthesized)
					context.interactedWith = true;
			});

			context.loadingPanel = true;

			context.container.empty();

			// show panel
			var width = context.container.outerWidth(true);
			var currentTransition = context.container.css('transition');

			if (isRightToLeft) {
				context.container.evolutionTransform({ right: -1 * width }, { duration: 0 }).show();
			} else {
				context.container.evolutionTransform({ left: -1 * width }, { duration: 0 }).show();
			}

			if(options.onPreRender) {
				options.onPreRender(panelNode);
			}

			panelNode.appendTo(context.container);

			context.currentPanelNode = panelNode;

			if (isRightToLeft) {
				context.container.evolutionTransform({
					right: 0
				}, {
					duration: transitionDuration,
					easing: transitionEasing,
					complete: function(){
						context.container.css({ transition: currentTransition });
						completeAnimationStateAndRunAnyDelayedOpen(context);
					}
				});
			} else {
				context.container.evolutionTransform({
					left: 0
				}, {
					duration: transitionDuration,
					easing: transitionEasing,
					complete: function(){
						context.container.css({ transition: currentTransition });
						completeAnimationStateAndRunAnyDelayedOpen(context);
					}
				});
			}

			// hide root
			context.rootCategories.evolutionTransform({
				left: (isRightToLeft ? 1 : -1) * context.rootCategories.width()
			}, { duration: transitionDuration / 2, easing: transitionEasing });

			$('body').addClass('contextual-administration-active');
			context.opened = true;

			showHeaderControls(context, panelNode, true);

			// show shade
			showShade(context);

			messaging.publish(events.shellOpen);
		} else {

			if(context.currentPanelNode) {
				// animate in the content within the container, animating out the old content
				// first determine the direction of animation by examining the hierarchical
				// position of the current panel type vs the new one

				// forward direction
				if((options.direction && options.direction == 'forward') ||
					(options.request && panelTypes[options.request.type] > panelTypes[context.previousPanelRequest.type]) ||
					(options.request.type == 'panel' && (options.request && panelTypes[options.request.type] >= panelTypes[context.previousPanelRequest.type]))
				)
				{
					// only re-render if the same panel isn't beig re-shown (error state)
					if(context.currentPanelNode !== panelNode) {

						context.loadingPanel = true;

						var oldContent = context.currentPanelNode;

						hideHeaderControls(context, oldContent, true);

						// slide out old content
						context.currentPanelNode
							.evolutionTransform( {
								left: (isRightToLeft ? 1 : -1) * context.currentPanelNode.outerWidth(true)// - 20
							}, {
								duration: transitionDuration,
								easing: transitionEasing,
								complete: function() {
									oldContent.remove();
								}
							});

						if(options.onPreRender) {
							options.onPreRender(panelNode);
						}

						// slide in new content
						panelNode.css({
								position: 'absolute',
								top: 0,
								width: context.container.width(),
								height: context.container.height()
							})
							.appendTo(context.container);

						context.currentPanelNode = panelNode;

						panelNode
							.evolutionTransform({ left: (isRightToLeft ? -1 : 1) * context.container.width() }, { duration: 0 })
							.evolutionTransform({ left: 0 }, { duration: transitionDuration, easing: transitionEasing,
								complete: function(){
									completeAnimationStateAndRunAnyDelayedOpen(context);
								}
							});

						showHeaderControls(context, panelNode, true);

						// hide any tips
						$.fn.evolutionTip.hide();
					}

				// backward direction
				} else {
					// only re-render if the same panel isn't beig re-shown (error state)
					if(context.currentPanelNode !== panelNode) {

						context.loadingPanel = true;

						var oldContent = context.currentPanelNode;

						hideHeaderControls(context, oldContent, true);

						// slide old content to right
						context.currentPanelNode
							.evolutionTransform({
								left: (isRightToLeft ? -1 : 1) * context.currentPanelNode.outerWidth(true)// + 20
							}, {
								duration: transitionDuration,
								easing: transitionEasing,
								complete: function() {
									setTimeout(function(){
										oldContent.remove();
									}, transitionDuration);
								}
							});

						if(options.onPreRender) {
							options.onPreRender(panelNode);
						}

						// slide in new content
						panelNode.css({
								position: 'absolute',
								top: 0,
								width: context.container.width(),
								height: context.container.height()
							})
							.appendTo(context.container)

						showHeaderControls(context, panelNode, true);

						context.currentPanelNode = panelNode;

						panelNode
							.evolutionTransform({ left: (isRightToLeft ? 1 : -1) * context.container.width() }, { duration: 0 })
							.evolutionTransform({ left: 0 }, { duration: transitionDuration, easing: transitionEasing,
								complete: function(){
									completeAnimationStateAndRunAnyDelayedOpen(context);
								}
							});

						// hide any tips
						$.fn.evolutionTip.hide();

					}
				}
			} else {
				context.loadingPanel = true;

				var oldContent = context.currentPanelNode;

				hideHeaderControls(context, oldContent, true);

				if(oldContent)
					oldContent.remove();
				context.container.append(panelNode);

				context.currentPanelNode = panelNode;

				showHeaderControls(context, panelNode, true);

				completeAnimationStateAndRunAnyDelayedOpen(context);

				// hide any tips
				$.fn.evolutionTip.hide();
			}

		}

		// apply scroll offset if one was provided
		if(options.scrollOffset) {
			panelNode.find('.contextual-panel-content').first().get(0).scrollTop = options.scrollOffset;
		}

		handlePanelAutohiding(context);
	}

	function diposeOfAdminContext(context, forceRefresh, all) {
		if(context.administrationContextManager) {
			context.administrationContextManager.dispose({
				refreshing: forceRefresh,
				all: all
			});
		}
	}

	function closePanel(context) {
		clearTimeout(context.closingTimeout);

		if(context.container && context.container.is(':visible')) {
			context.currentPanelRequest = null;

			context.closingTimeout = setTimeout(function(){
				handlingAutoHidingEvents = false;

				if(context.shade) {
					context.shade.off('.contextshell');
					context.shade.remove();
					delete context.shade;
				}

				if(context.loadingIndicator) {
					context.loadingIndicator.remove();
					delete context.loadingIndicator;
				}

				if(context.container) {
					context.container.off('.contextshell');
					context.container.remove();
					delete context.container;
				}

			}, transitionDuration + 50);

			var closedData = {
				redirected: false
			};

			// hide all tips
			$.fn.evolutionTip.hide();
			messaging.publish(events.shellClosed, closedData);
			diposeOfAdminContext(context, false, true);

			// hide panel
			var width = context.container.outerWidth(true);
			var currentTransition = context.container.css('transition');
			context.container.evolutionTransform({ left: (isRightToLeft ? 1 : -1) * width }, { duration: transitionDuration, easing: transitionEasing, complete: function() {
				if (context.container) {
					context.container.hide().empty();
					context.container.css({ transition: currentTransition });
				}
				context.currentPanelRequest = null;
			}})

			// show root
			context.rootCategories.evolutionTransform({
				left: 0
			}, { duration: transitionDuration / 2, easing: transitionEasing });

			$('body').removeClass('contextual-administration-active');
			context.opened = false;

			// hide shade
			hideShade(context);

			// hide any tips
			$.fn.evolutionTip.hide();

			var urlData = $.telligent.evolution.url.parseQuery(window.location.href + '');
			if (!closedData.redirected && urlData._cpdefault) {
				var returnUrl = urlData._cpreturnurl;
				if (!returnUrl) {
					returnUrl = $.telligent.evolution.url.modify({
							query: {
								_cpdefault: '_cpdefault'
							}
					}).replace('_cpdefault=_cpdefault', '');
					if (returnUrl.substr(returnUrl.length - 1) == '#') {
						returnUrl = returnUrl.substr(0, returnUrl.length - 1);
					}
					if (returnUrl.substr(returnUrl.length - 1) == '?') {
						returnUrl = returnUrl.substr(0, returnUrl.length - 1);
					}
				} else {
					returnUrl = $.telligent.evolution.url.modify({
						url: returnUrl,
						hash: ''
					});
				}
				window.location = returnUrl;
			}
		}
	}


	var platformParameters = [
		'_cptype',
		'_cppanelid',
		'_cpcontexttype',
		'_cpcontextid'
	];
	var PanelRequest = {
		// value is hashdata or
		deserialize: function(hashData) {
			hashData = hashData || $.telligent.evoluion.url.hashdata();
			var panelRequestData = {};

			if(!hashData || !hashData._cptype)
				return panelRequestData;

			panelRequestData.type = hashData._cptype;
			if(panelRequestData.type == 'panel') {
				panelRequestData.panelId = hashData._cppanelid;
				panelRequestData.contextType = hashData._cpcontexttype;
				if(panelRequestData.contextType == 'Explicit') {
					// add other non-platform paremeters from the hash.
					var extraParameters = null;
					$.each(hashData, function(k,v) {
						if($.inArray(k, platformParameters) < 0) {
							extraParameters = extraParameters || {};
							extraParameters[k] = v;
						}
					});
					if(extraParameters) {
						panelRequestData.parameters = $.telligent.evolution.url.serializeQuery(extraParameters);
					}
				}
			} else if(panelRequestData.type == 'category') {
				panelRequestData.contextType = hashData._cpcontexttype;
				panelRequestData.contextId = hashData._cpcontextid;
			} else if(panelRequestData.type == 'root') {
				// no other context is necessary
			}

			return panelRequestData;
		},
		serialize: function(panelRequest) {
			if(!panelRequest)
				return '#';

			var urlParts = [];

			urlParts.push('#');
			urlParts.push('_cptype=');
			urlParts.push(panelRequest.type);

			if(panelRequest.type == 'panel') {
				urlParts.push('&_cppanelid=');
				urlParts.push(panelRequest.panelId);
				urlParts.push('&_cpcontexttype=');
				urlParts.push(panelRequest.contextType);
			} else if(panelRequest.type == 'category') {
				urlParts.push('&_cpcontexttype=');
				urlParts.push(panelRequest.contextType);
				urlParts.push('&_cpcontextid=');
				urlParts.push(panelRequest.contextId);
			}

			return urlParts.join('');
		}
	};

	var api = {
		register: function(options) {
			// only allow 1 registration
			if(registered)
				return;
			registered = true;

			var context = options;
			context.opened = false;
			context.currentPanelRequest = null;

			initUi(context);
			initAdminContextManager(context);
			handleEvents(context);
			processPanelState(context);
		}
	};

	$.telligent = $.telligent || {};
	$.telligent.evolution = $.telligent.evolution || {};
	$.telligent.evolution.widgets = $.telligent.evolution.widgets || {};
	$.telligent.evolution.widgets.contextualPanelShell = api;

})(jQuery, window);
