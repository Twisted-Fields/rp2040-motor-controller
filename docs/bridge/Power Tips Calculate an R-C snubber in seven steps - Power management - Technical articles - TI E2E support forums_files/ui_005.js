(function ($, global, undef) {

	var openHeaderListContext = null;
	var activateMessage = 'telligent.evolution.widgets.siteBanner.activate';
	var deactivateMessage = 'telligent.evolution.widgets.siteBanner.deactivate';

	function supportsTouch() {
		return 'ontouchstart' in window;
	}

	var util = {
		throttle: function (fn, limit) {
			var lastRanAt, timeout;
			return function () {
				var scope = this,
					attemptAt = (new Date().getTime()),
					args = arguments;
				if (lastRanAt && (lastRanAt + (limit || 50)) > attemptAt) {
					global.clearTimeout(timeout);
					timeout = global.setTimeout(function () {
						lastRanAt = attemptAt;
						fn.apply(scope, args);
					}, (limit || 50));
				} else {
					lastRanAt = attemptAt;
					fn.apply(scope, args);
				}
			};
		},
		debounce: function (fn, limit) {
			var bounceTimout;
			return function () {
				var scope = this,
					args = arguments;
				clearTimeout(bounceTimout);
				bounceTimout = setTimeout(function () {
					fn.apply(scope, args);
				}, limit || 10);
			}
		}
	}

	// UI which can render endlessly-scrolling items in a popup.
	// Supports defining filters
	// Updating site-wide bubble counts
	var HeaderList = (function ($) {
		// private static members of a HeaderList
		var totalTitleCount = 0, // title bar count which multiple instances can contribute to
			mask,
			defaults = {
				key: '',
				activationLink: null,
				activationInput: null,
				initialUnreadCount: 0,
				footerContent: null,
				showCount: true,
				endlessScroll: false,
				cssClass: '',
				template: '',
				loading: false,
				titleCount: false,
				titleCountClass: '',
				previousCount: 0,
				wrapper: null,
				unreadCountMessageSingular: 'You have {0} unread item',
				unreadCountMessagePlural: 'You have {0} unread items',
				onShowLoadingIndicator: function () {
					return true;
				},
				onLoad: function (pageIndex, shouldRefreshUnreadCount, filter, complete, onPreLoad) {
					if (onPreLoad) {
						onPreLoad();
					}
					// load more items
					// for each item loaded, marks it as read
					// after items loaded and marks as read, gets new unread count and updates via updateUnreadCount via refreshUnreadCount
					// complete(contentToShow)
					complete('');
				},
				onRefreshUnreadCount: function (complete) {
					// get new unread count
					// update it via complete()
					complete(5);
				},
				onBuildFilter: null, // function(filtered) {
				// when defined, returns a DOM node to be inserted at the top which presentes a filtering UI
				// filtered(filter) can be called to raise a filter
				// }
				onShow: function (activator, complete) { // deferred display options
					// calls complete with display options to use when displaying
					// complete({
					//width: 280
					//maxHeight: 300
					//attachTo: activator
					//})
					complete({});
				},
				onHide: function () {

				},
				onSelect: function (item, fromLink) {
					if (fromLink)
						return true;

					var url = $(item).data('contenturl');
					// Sitecatalyst tracking
				    _TrackSC(window.location, "Search");
					if (url) {
						window.location = url;
					}
				}
			},
			defaultShowSettings = {
				attachTo: null,
				width: 373,
				maxHeight: 300,
				cssClass: null
			};

		function blockWindowScrolling(context) {
			if ($('body').hasClass('stop-scrolling'))
				return;

			// block window scrolling not in the popup, or popup scrolling at its boundaries
			context.popupContentList.on('wheel', function (e) {
				var e = e || window.event,
					originalEvent = e.originalEvent || e,
					delta = 0,
					scrollTop = context.popupContentList.get(0).scrollTop,
					scrollHeight = context.popupContentList.get(0).scrollHeight,
					height = context.popupContentList.height();

				if (originalEvent.wheelDelta)
					delta = originalEvent.wheelDelta / 120;
				if (originalEvent.detail)
					delta = -originalEvent.detail / 3;

				if ((scrollTop === (scrollHeight - height) && delta < 0) ||
					(scrollTop === 0 && delta > 0)) {
					if (e.preventDefault)
						e.preventDefault();
					e.returnValue = false;
				}
			});

			// block touch scrolling
			var lastY;
			$('body').addClass('stop-scrolling')
				.on('pointerstart.scrollfix', function (e) {
					lastY = e.pointers[0].pageY;
				})
				.on('pointerend.scrollfix', function (e) {
					lastY = null;
				})
				.on('pointermove.scrollfix', function (e) {
					if (!e.pointers || e.pointers.length == 0)
						return;

					var isDirectionDown = e.pointers[0].pageY - lastY > 0;

					var list = $(e.target).closest('.popup-list ul.content-list.content');
					if (!list || list.length == 0) {
						e.preventDefault();
						return false;
					}

					var ul = context.popupContentList.get(0),
						ulScrollTop = ul.scrollTop,
						ulScrollHeight = ul.scrollHeight,
						ulHeight = ul.offsetHeight;

					if (ulHeight == 0 || ulScrollHeight == 0)
						return;

					// list isn't scrollable, so block scrolling
					if (ulScrollHeight - ulHeight <= 0) {
						e.preventDefault()
						return false;
					}

					// list is scrollable and at the top
					if (ulScrollTop == 0 && isDirectionDown) {
						e.preventDefault();
						return false;
					}
					// list is scrollable and at end
					if ((ulScrollTop + ulHeight >= ulScrollHeight) && !isDirectionDown) {
						e.preventDefault();
						return false;
					}
				});

			if (!mask)
				mask = $('<div></div>')
				.addClass('mask')
				.appendTo('body')
				.css({
					opacity: 0.01,
					zIndex: 1
				})
				.evolutionTransform({
					opacity: 0.7
				}, {
					duration: 150
				})
				.on('click', function () {
					api.hideCurrent();
				});

			preventBodyBounce($('body').children().first());
		}

		function unblockWindowScrolling(context) {
			if (!$('body').hasClass('stop-scrolling'))
				return

			$('body').removeClass('stop-scrolling').off('.scrollfix');

			if (context.popupContentList)
				context.popupContentList.off('wheel');

			if (mask) {
				setTimeout(function () {
					if (mask) {
						if (!$('body').hasClass('stop-scrolling')) {
							mask.evolutionTransform({
								opacity: 0.01
							}, {
								duration: 100
							});
							setTimeout(function () {
								if (mask)
									mask.remove();
								mask = null;
							}, 100);
						}
					}
				}, 100);
			}

			allowBodyBounce($('body').children().first());
		}

		function allowBodyBounce(selection) {
			selection.off('.scrollfix');
		}

		function preventBodyBounce(selection) {
			var originalScrollTop,
				elem = selection.get(0);
			selection.on('pointerstart.scrollfix', function (e) {
				originalScrollTop = elem.scrollTop;

				if (originalScrollTop <= 0)
					elem.scrollTop = 1;

				if (originalScrollTop + elem.offsetHeight >= elem.scrollHeight)
					elem.scrollTop = elem.scrollHeight - elem.offsetHeight - 1;

				originalScrollLeft = elem.scrollLeft;

				if (originalScrollLeft <= 0)
					elem.scrollLeft = 1;

				if (originalScrollLeft + elem.offsetWidth >= elem.scrollWidth)
					elem.scrollLeft = elem.scrollWidth - elem.offsetWidth - 1;
			});
		}

		function buildCountBubble(context) {
			var wrapper = context.activationLink.wrap('<span></span>').parent('span').css({
				position: 'relative'
			});
			var count = $('<a href="#" class="popup-list-count ' + context.titleCountClass + '"></a>');
			count.appendTo(wrapper).hide().on('click', function (e) {
				e.preventDefault();
				context.activationLink.trigger('click');
			});
			return count;
		}

		function buildUnreadCountMessage(context, count) {
			count = count || 0;
			if (count === 1) {
				return context.unreadCountMessageSingular.replace(/\{0\}/gi, count);
			} else {
				return context.unreadCountMessagePlural.replace(/\{0\}/gi, count);
			}
		}

		function showUnreadCount(context, count) {
			if (!context.showCount)
				return;
			var difference = count - context.previousCount;
			context.previousCount = count;
			if (context.titleCount) {
				totalTitleCount += difference;
				if (context.handheldBannerLinksCount) {
					if (totalTitleCount <= 0) {
						context.handheldBannerLinksCount.hide();
					} else {
						context.handheldBannerLinksCount.html(totalTitleCount).show();
					}
				}
			}
			var unreadCountMessage = buildUnreadCountMessage(context, count);
			if (count <= 0) {
				// remove bubble ui
				if (context.count)
					context.count.fadeOut(200);
				context.activationLink.attr('data-tip', unreadCountMessage).attr('title', unreadCountMessage);
			} else {
				// add bubble ui if not there
				context.count = context.count || buildCountBubble(context);
				// set the count and display it
				context.count
					.html((context.limitCount && context.limitCount < count) ? context.limitCount + "+" : count)
					.attr('title', unreadCountMessage)
					.fadeIn(200);
				context.activationLink.attr('data-tip', unreadCountMessage).attr('title', unreadCountMessage);
			}
		}

		function loadShowSettings(activator, context) {
			return $.Deferred(function (dfd) {
				context.onShow(activator, function (settings) {
					dfd.resolve($.extend({}, defaultShowSettings, settings || {}));
				});
			}).promise();
		}

		function loadContent(context, pageIndex, shouldRefreshUnreadCount) {
			context.loading = true;
			// call the injected loading method, and return a promise
			// which, when done, provides the content from the loading method
			return $.Deferred(function (dfd) {
				context.onLoad(pageIndex, shouldRefreshUnreadCount, context.filter || '', function (content) {
					if (content === null || content === undef) {
						dfd.reject();
					} else {
						if (context.onShowLoadingIndicator())
							hideLoading(context, (pageIndex > 0));
						dfd.resolve(content);
					}
				}, function () {
					if (context.onShowLoadingIndicator()) {
						showLoading(context, (pageIndex > 0));
					}
				});
			}).promise();
		}

		function buildPopUp(context) {
			context.compiledTemplate = context.compiledTemplate || $.telligent.evolution.template.compile(context.template);

			context.popup = $(context.compiledTemplate(context));
			context.loadingIndicator = context.popup.find('.loading').hide();
			context.popupContentList = context.popup.find('.content-list');
			context.footer = context.popup.find('.content-list-footer');
			context.popup.glowPopUpPanel({
				cssClass: 'popup-list ' + context.cssClass,
				hideOnDocumentClick: false,
				hideOnResize: (supportsTouch() ? false : true),
				position: 'down',
				zIndex: 1000
			}).on('glowPopUpPanelShowing', function (e, data) {
				(context.activator).attr('data-position', data.position).addClass('active');
				if (context.showSettings.attachTo)
					context.showSettings.attachTo.addClass('active');
			}).on('glowPopUpPanelHiding', function (e, data) {
				(context.activator).attr('data-position', '').removeClass('active');
				if (context.showSettings.attachTo)
					context.showSettings.attachTo.removeClass('active');
				context.onHide();
				unblockWindowScrolling(context);
			});
			$(document).on('click', function () {
				context.popup.glowPopUpPanel('hide');
			});
			if (context.onBuildFilter !== null) {
				var filter = context.onBuildFilter(function (result) {
					if (!isOpenOrOpening(context))
						return;
					context.filter = result;
					context.currentPageIndex = 0;
					loadContent(context, context.currentPageIndex, true).then(function (content) {
						showPopup(context, content, context.showSettings);
					});
				});
				if (filter) {
					$(filter).insertBefore(context.popupContentList);
				}
			}
		}

		function showLoading(context, append) {
			if (append) {
				context.loadingIndicator.show();
			} else {
				setTimeout(function () {
					if (!context.loading)
						return;
					if (openHeaderListContext && openHeaderListContext != context) {
						hidePopup(openHeaderListContext);
					}
					openHeaderListContext = context;
					context.popup.glowPopUpPanel('show', (context.showSettings.attachTo || context.activator));
					context.popupContentList.empty();
					context.loadingIndicator.show();
					(context.activator).addClass('active');
					blockWindowScrolling(context);
				}, 20);
			}
		}

		function hideLoading(context, append) {
			context.loadingIndicator.hide();
		}

		function showPopup(context, content, showSettings) {
			if (openHeaderListContext && openHeaderListContext != context) {
				hidePopup(openHeaderListContext);
			}
			openHeaderListContext = context;

			var contentItems;
			var updateFacetedFilters = false;
			var nodes = $(content);

			if (nodes.length > 0 && nodes[0].tagName == 'UL') {
				contentItems = nodes.children('ul li.content-item');
				if (contentItems.length == 0)
					contentItems = nodes.children('ul div');
				updateFacetedFilters = true;
			} else
				contentItems = content;

			if (updateFacetedFilters == true)
				updateContentTypesFilter(context, content);
			else
				removeContentTypesFilter(context, content);

			context.popupContentList.empty().append(contentItems);
			context.popup.glowPopUpPanel('show', (showSettings.attachTo || context.activator));
			context.loading = false;
			context.hasMore = context.popupContentList.children('li').last().data('hasmore') ? true : false;
			(context.activator).addClass('active');
			context.popupContent = context.popupContentList.closest('.popup-list');
			blockWindowScrolling(context);
			context.currentItemIndex = null;
			$.telligent.evolution.messaging.publish(context.activateMessage, {
				key: context.key
			});
		}

		function updateContentTypesFilter(context, content) {
			context.popupContentList.parent().find("ul.navigation-list.filter.categories").remove();

			var items = $(content).children('li.navigation-item');
			if (items.length > 0) {
				var contentTypesNavigation = $("<ul class='navigation-list filter categories'></ul>")
				contentTypesNavigation.append(items);
				context.popupContentList.parent().find('div.search-filters').append(contentTypesNavigation);
			}
		}

		function removeContentTypesFilter(context, content) {
			context.popupContentList.parent().find("ul.navigation-list.filter.categories").remove();
		}

		function hidePopup(context) {
			if (context.popup) {
				context.popup.glowPopUpPanel('hide');
				unblockWindowScrolling(context);
				$.telligent.evolution.messaging.publish(context.deactivateMessage, {
					key: context.key
				});
			}
		}

		function appendToPopup(context, content, shouldReplace) {
			if (content === null)
				return;

			var contentItems;
			var updateFacetedFilters = false;
			var nodes = $(content);

			if (nodes.length > 0 && nodes[0].tagName == 'UL') {
				contentItems = nodes.children('ul li.content-item');
				if (contentItems.length == 0) {
					contentItems = nodes.children('ul div');
				}
				updateFacetedFilters = true;
			} else
				contentItems = content;

			if (shouldReplace) {
				context.popupContentList.empty();
				context.popupContentList.append(contentItems);
			} else {
				context.popupContentList.append(contentItems);
			}

			if (updateFacetedFilters == true)
				updateContentTypesFilter(context, content);
			else
				removeContentTypesFilter(context, content);

			context.loading = false;
			context.hasMore = context.popupContentList.children('li:last').data('hasmore') ? true : false;
			//$.telligent.evolution.messaging.publish(context.activateMessage, { key: context.key });
		}

		function deactivate(context) {
			hidePopup(context);
			if (context.activationInput.val().length > 2 || context.activationInput.val().length < 1) {
		        _tiAnalyticsTrack("e2e search abandonment", context.activationInput.val(), "e2e-quicksearch", "all");
		    }
		}

		function activate(activator, context) {
			context.currentPageIndex = 0;
			context.hasMore = true;
			activator.addClass('active');
			loadShowSettings(activator, context).then(function (showSettings) {
				context.showSettings = showSettings;
				context.popupContentList.css({
					width: showSettings.width,
					maxHeight: showSettings.maxHeight
				});
				loadContent(context, context.currentPageIndex, true).then(function (content) {
					showPopup(context, content, showSettings);
				});
			});
		}

		function handlePopoupOpenerClick(link, context) {
			if (context.popup.glowPopUpPanel('isOpening')) {
				return;
			} else if (context.popup.glowPopUpPanel('isShown')) {
				hidePopup(context);
				deactivate(context);
			} else {
				activate(link, context);
			}
		}

		function isOpenOrOpening(context) {
			return context.popup.glowPopUpPanel('isOpening') ||
				context.popup.glowPopUpPanel('isShown');
		}

		function move(context, direction, handler) {
			var availableItems = $(context.popupContentList.children('li.content-item'));
			if (availableItems.length == 0)
				return;

			availableItems.removeClass('selected');

			if (context.currentItemIndex === null) {
				context.currentItemIndex = 0;
			} else if (direction == 'down') {
				context.currentItemIndex++;
				if (context.currentItemIndex >= availableItems.length)
					context.currentItemIndex = 0;
			} else if (direction == 'up') {
				context.currentItemIndex--;
				if (context.currentItemIndex < 0)
					context.currentItemIndex = (availableItems.length - 1);
			}

			// get item to scroll to
			var selectedItem = $(availableItems[context.currentItemIndex]);
			if (!selectedItem)
				return;

			// scroll to it
			context.popupContentList.animate({
				scrollTop: (context.popupContentList.scrollTop() -
					context.popupContentList.offset().top +
					selectedItem.offset().top -
					selectedItem.height())
			}, 100);

			// highlight it
			selectedItem.addClass('selected');

			// inform calling code of selection
			handler(selectedItem);
		}

		function handleEvents(context) {
			context.activationLink.on('click', function (e) {
				e.preventDefault();
				handlePopoupOpenerClick(context.activationLink, context);
				return false;
			});
			// go ahead and immeidately handle, as handleEvents is only
			// first called from a deferred click
			// handlePopoupOpenerClick(context.activationLink, context);

			var debouncedActivate = util.debounce(activate, 600);

			context.activationInput.on({
				focus: function (e) {
					e.preventDefault();

					var val = $.trim(context.activationInput.val());
					if (!isOpenOrOpening(context) && val.length >= 3) {
						activate($(e.target), context);
					}

					return false;
				},
				blur: function (e) {},
				'input propertychange': function (e) {
					e.preventDefault();

					if (e.type == 'propertychange' && e.originalEvent.propertyName != "value")
						return false;

					var val = $.trim(context.activationInput.val());
					if (!isOpenOrOpening(context) && val.length >= 3) {
						debouncedActivate($(e.target), context);
					} else if (isOpenOrOpening(context) && val.length < 3) {
						deactivate(context);
					}

					return false;
				}


			})
			// handle endless scrolling if enabled
			if (context.endlessScroll) {
				context.popupContentList.on('scrollend', function () {
					if (!context.hasMore) {
						return false;
					}
					if (context.loading) {
						return false;
					}
					context.currentPageIndex++;
					loadContent(context, context.currentPageIndex, true).then(function (content) {
						appendToPopup(context, content);
					});
					return false;
				});
			}
			context.popupContentList.on('click', '.content-item a', function (e) {
				var result = context.onSelect(this, true);
				if (!result) {
					e.preventDefault();
				}
			});
			context.popupContentList.on('click', '.content-item', function (e) {
				e.preventDefault();
				context.onSelect(this);
			});
			context.popupContentList.on('click', 'a', function (e) {
				e.stopPropagation();
			});
		}

		function initContext(context) {
			context.activationLink = $(context.activationLink);
			context.activationInput = $(context.activationInput);
			context.activator = context.activationLink.length > 0 ? context.activationLink : context.activationInput;
		}

		function api(options) {
			// private instance members of a HeaderList
			var context = $.extend({}, defaults, options || {});
			initContext(context);
			var inited = false;

			function init() {
				if (inited)
					return;
				inited = true;
				buildPopUp(context);
				handleEvents(context);
			}

			// lazy-setup until clicked
			context.activationLink.one('click', function (e) {
				e.preventDefault();
				init();
				context.activationLink.trigger('click');
			});
			context.activationInput.one('focus', function (e) {
				init();
				context.activationInput.trigger('focus');
			});
			showUnreadCount(context, context.initialUnreadCount);

			// public instance members of a HeaderList
			return {
				refreshUnreadCount: function () {
					return context.onRefreshUnreadCount(function (newCount) {
						showUnreadCount(context, newCount);
					});
				},
				refreshContent: function () {
					// refreshing content only has an effect if already shown
					if (context.popup && context.popup.glowPopUpPanel('isShown')) {
						context.currentPageIndex = 0;
						loadContent(context, context.currentPageIndex, false).then(function (content) {
							appendToPopup(context, content, true);
						});
					}
				},
				content: function () {
					return context.popupContentList;
				},
				footer: function () {
					return context.footer;
				},
				activate: function () {
					init();
					activate($(context.activationInput || context.activationLink), context);
				},
				deactivate: function () {
					deactivate(context);
				},
				moveUp: function (handler) {
					move(context, 'up', handler);
				},
				moveDown: function (handler) {
					move(context, 'down', handler);
				}
			};
		};
		// public static members of a HeaderList
		api.hideCurrent = function () {
			if (openHeaderListContext) {
				hidePopup(openHeaderListContext);
			}
		};

		return api;

	})($);

	function initNotificationList(context) {
		var debouncedNotificationReadTimeout;
		var suppressNotificationsReadMessage = false;
		var suppressNotificationsReadMessageTimeout;
		var currentTotalCount = 0;
		var currentNotificationCategoryId = '';

		function displayNotificationPreference(context, notificationItem) {
			// set the notification list size during preference-displaying so that it does not resize out of the bounds of the popup
			context.notificationList = context.notificationList || notificationItem.closest('ul');
			context.notificationList.css({
				height: context.notificationList.height()
			});
			if (context.preferenceUi) {
				hideNotificationPreference(context, context.preferenceUi);
				context.preferenceUi = null;
			}
			context.preferenceTemplate = context.preferenceTemplate || $.telligent.evolution.template.compile(context.notificationPreferenceTemplate);
			context.preferenceUi = $(context.preferenceTemplate({
					notificationTypeName: notificationItem.data('notificationtypename'),
					notificationTypeId: notificationItem.data('notificationtypeid')
				}))
				.hide()
				.appendTo(notificationItem);
			context.preferenceUi.css({
				position: 'absolute',
				top: 0,
				left: 0,
				zIndex: 2000
			});

			notificationItem.addClass('with-preference');
			notificationItem.data('originalHeight', notificationItem.outerHeight());
			notificationItem.animate({
				height: context.preferenceUi.height()
			}, 150);

			context.preferenceUi.fadeTo(150, 0.98);
		}

		function hideNotificationPreference(context, preferenceItem) {
			context.notificationList.css({
				height: 'auto'
			});
			if (preferenceItem) {
				var notificationItem = preferenceItem.parent();
				notificationItem.animate({
					height: notificationItem.data('originalHeight')
				}, 150);
				preferenceItem.fadeOut(150, function () {
					notificationItem.removeClass('with-preference');
					preferenceItem.remove();
				});
			}
		}

		function disableNotificationType(context, notificationTypeId) {
			return $.telligent.evolution.put({
				url: $.telligent.evolution.site.getBaseUrl() + 'api.ashx/v2/notificationpreference.json',
				data: {
					NotificationTypeId: notificationTypeId,
					IsEnabled: false
				},
				dataType: 'json'
			});
		}

		function cleanUpAfterRemoval(notificationCategoryId) {
			if (context.notificationsList.content().find('.content-item[data-notificationcategoryid="' + notificationCategoryId + '"]').length == 0) {
				var header = context.notificationsList.content().find('.content-item-header[data-notificationcategoryid="' + notificationCategoryId + '"]');
				if (header.nextAll('.content-item-header').length == 0) {
					currentNotificationCategoryId = '';
				}
				header.remove();
				if (context.notificationsList.content().find('.content-item[data-notificationcategoryid!="' + notificationCategoryId + '"]').length == 0) {
					context.notificationsList.refreshContent();
				}
			}
		}

		function initNotificationItemHandlers() {
			// mark individual notifications as read
			context.notificationsList.content().on('click', '.mark a, .mark-all a', function (e) {
				e.preventDefault();
				var markLink = $(e.target);
				var notificationLineItem = $(this).closest('li');
				if (notificationLineItem.hasClass('content-item-header')) {
					markAllAsRead(notificationLineItem.data('notificationcategoryid'));
				} else {
					var notificationId = notificationLineItem.data('notificationid');
					var categoryId = notificationLineItem.data('notificationcategoryid');
					markNotificationAsRead(notificationId).then(function () {
						markLink.hide();
						notificationLineItem.removeClass('unread');
						notificationLineItem.fadeOut(200, function () {
							notificationLineItem.remove();
							cleanUpAfterRemoval(categoryId);
						});
						context.notificationsList.refreshUnreadCount();
					});
				}
				return false;
			});

			// display preference change ui on 'x' click
			context.notificationsList.content().on('click', '.preference a', function (e) {
				e.preventDefault();
				displayNotificationPreference(context, $(this).closest('li'));
				return false;
			});

			// handle cancels of preference change when clicking 'cancel'
			context.notificationsList.content().on('click', '.notification-preference .cancel', function (e) {
				e.preventDefault();
				e.stopPropagation();
				hideNotificationPreference(context, $(this).closest('.notification-preference'));
				context.preferenceUi = null;
				return false;
			});

			// handle cancels of preference change by clicking anything other than 'turn off'
			context.notificationsList.content().on('click', '.notification-preference', function (e) {
				e.preventDefault();
				e.stopPropagation();
				hideNotificationPreference(context, $(this));
				context.preferenceUi = null;
				return false;
			});

			// handle confirmed preference changes
			context.notificationsList.content().on('click', '.notification-preference .confirm', function (e) {
				e.preventDefault();
				var notificationPreference = $(this).closest('.notification-preference'),
					notificationItem = notificationPreference.closest('li');
				disableNotificationType(context, $(this).data('notificationtypeid')).then(function () {
					notificationItem.fadeOut(200, function () {
						notificationPreference.remove();
						notificationItem.remove();
					});
					context.preferenceUi = null;
				});
				return false;
			});
		};

		function markNotificationAsRead(notificationId) {
			clearTimeout(suppressNotificationsReadMessageTimeout);
			suppressNotificationsReadMessage = true;
			var markNotificationPromise = $.telligent.evolution.put({
				url: $.telligent.evolution.site.getBaseUrl() + 'api.ashx/v2/notification/{NotificationId}.json',
				data: {
					NotificationId: notificationId,
					MarkAsRead: true
				}
			});
			markNotificationPromise.then(function () {
				suppressNotificationsReadMessageTimeout = setTimeout(function () {
					suppressNotificationsReadMessage = false;
				}, 5000);
			});
			return markNotificationPromise;
		}


		function markAllAsRead(notificationCategoryId) {
			var unreadItems = context.notificationsList.content().find('> li.unread[data-notificationcategoryid="' + notificationCategoryId + '"]');
			// remove unread UI state immediately before waiting for server change
			unreadItems.removeClass('unread');
			clearTimeout(suppressNotificationsReadMessageTimeout);
			suppressNotificationsReadMessage = true;
			$.telligent.evolution.put({
				url: $.telligent.evolution.site.getBaseUrl() + 'api.ashx/v2/notifications.json',
				data: {
					NotificationCategoryId: notificationCategoryId,
					MarkAsRead: true
				}
			}).then(function () {
				unreadItems.each(function () {
					var item = $(this);
					item.fadeOut(200, function () {
						item.remove();
						cleanUpAfterRemoval(notificationCategoryId);
					});
				});
				context.notificationsList.refreshUnreadCount();
				suppressNotificationsReadMessageTimeout = setTimeout(function () {
					suppressNotificationsReadMessage = false;
				}, 5000);
			});
		}

		context.notificationsList = HeaderList({
			activateMessage: context.activateMessage,
			deactivateMessage: context.deactivateMessage,
			key: 'notifications',
			footerContent: context.notificationListFooterContent,
			initialUnreadCount: context.notificationsUnread,
			activationLink: context.notificationsLink,
			endlessScroll: true,
			titleCount: true,
			limitCount: 99,
			cssClass: 'notifications',
			unreadCountMessageSingular: context.notificationssUnreadCountMessageSingular,
			unreadCountMessagePlural: context.notificationssUnreadCountMessagePlural,
			wrapper: context.banner,
			handheldBannerLinksCount: context.handheldBannerLinksCount,
			onLoad: function (pageIndex, shouldRefreshUnreadCount, filter, complete, onPreLoad) {
				if (!context.isInited) {
					context.isInited = true;
					initNotificationItemHandlers();
				}
				if (context.notificationList) {
					context.notificationList.css({
						height: 'auto'
					});
				}
				if (pageIndex == 0) {
					currentNotificationCategoryId = '';
				}
				if (onPreLoad) {
					onPreLoad();
				}
				$.telligent.evolution.get({
					url: context.notificationsUrl,
					data: {
						w_pageIndex: pageIndex,
						w_currentNotificationCategoryId: currentNotificationCategoryId
					},
					success: function (response) {
						var header = $(response).filter('.content-item-header').last();
						if (header.length > 0) {
							currentNotificationCategoryId = header.data('notificationcategoryid');
						}
						// show response
						complete(response);
						// update count
						if (shouldRefreshUnreadCount)
							context.notificationsList.refreshUnreadCount();
					}
				});
			},
			onRefreshUnreadCount: function (complete) {
				if ($.telligent.evolution.user.accessing.isSystemAccount || $.telligent.evolution.user.accessing.isTemporary) {
					complete(0);
					currentTotalCount = 0;
					return;
				}

				var query = {
					IsRead: false,
					PageSize: 1,
					PageIndex: 0
				};
				// exclude conversation notifications
				query['_Filters_' + context.conversationNotificationTypeId] = 'Exclude';
				return $.telligent.evolution.get({
					url: $.telligent.evolution.site.getBaseUrl() + 'api.ashx/v2/notifications.json',
					cache: false,
					data: query,
					success: function (response) {
						complete(response.TotalCount);
						currentTotalCount = response.TotalCount;
					},
					error: {}
				});
			},
			template: context.notificationsTemplate,
			onShow: function (activator, complete) {
				complete(buildShowSettings(context, activator, {}));
			},
			onSelect: function (item, fromLink) {
				if (fromLink)
					return true;

				item = $(item);
				var notificationId = item.data('notificationid'),
					contentUrl = item.data('contenturl');

				if (item.hasClass('unread')) {
					// mark as read
					markNotificationAsRead(notificationId).then(function () {
						// then navigate to it if different or just refresh the unread count
						if (window.location.href != contentUrl) {
							window.location.href = contentUrl;
						} else {
							context.notificationsList.refreshUnreadCount();
						}
					});
				} else {
					window.location.href = contentUrl;
				}
			}
		});

		// update the notification list's count when a new notification is received which isn't a conversation type
		$.telligent.evolution.messaging.subscribe('notification.raised', function (notification) {
			if (notification.typeId !== context.conversationNotificationTypeId) {
				context.notificationsList.refreshUnreadCount().then(function () {
					context.notificationsList.refreshContent();
				});
			}
		});

		// update the notification list's count when a new notification is received which isn't a conversation type
		$.telligent.evolution.messaging.subscribe('notification.read', function (notification) {
			if (notification.typeId !== context.conversationNotificationTypeId) {
				// wait until a gap in notification.read events, in case many have just been received
				clearTimeout(debouncedNotificationReadTimeout);
				debouncedNotificationReadTimeout = setTimeout(function () {
					if (suppressNotificationsReadMessage) {
						return;
					}
					context.notificationsList.refreshUnreadCount().then(function () {
						context.notificationsList.refreshContent();
					});
				}, 100);
			}
		});

		return context.notificationsList;
	}

	function initConversationList(context) {

		var debouncedNotificationReadTimeout = null;
		var suppressNotificationsReadMessage = false;
		var suppressNotificationsReadMessageTimeout = null;

		function cleanUpAfterRemoval() {
			if (context.conversationsList.content().find('.content-item.unread').length == 0) {
				context.conversationsList.refreshContent();
			}
		}

		function markAsRead(conversationId) {
			clearTimeout(suppressNotificationsReadMessageTimeout);
			suppressNotificationsReadMessage = true;
			var markReadPromise = $.telligent.evolution.put({
				url: $.telligent.evolution.site.getBaseUrl() + 'api.ashx/v2/conversations/{ConversationId}/read.json',
				data: {
					ConversationId: conversationId,
					HasRead: true
				}
			});
			markReadPromise.then(function () {
				suppressNotificationsReadMessageTimeout = setTimeout(function () {
					suppressNotificationsReadMessage = false;
				}, 5000);
			});
			return markReadPromise;
		}

		function markAllAsRead() {
			var unreadItems = context.conversationsList.content().find('> li.unread');
			// remove unread UI state immediately before waiting for server change
			unreadItems.removeClass('unread');
			clearTimeout(suppressNotificationsReadMessageTimeout);
			suppressNotificationsReadMessage = true;
			$.telligent.evolution.batch(function () {
				// loop through all of the currently visible unread notification items
				unreadItems.each(function () {
					var item = $(this);
					markAsRead(item.data('conversationid'))
						.then(function () {
							item.fadeOut(200, function () {
								item.remove();
								cleanUpAfterRemoval();
							});
						});
				});
			}).then(function () {
				context.conversationsList.refreshUnreadCount();
				suppressNotificationsReadMessageTimeout = setTimeout(function () {
					suppressNotificationsReadMessage = false;
				}, 5000);
			});
		}

		context.conversationsList = HeaderList({
			activateMessage: context.activateMessage,
			deactivateMessage: context.deactivateMessage,
			key: 'conversations',
			footerContent: context.conversationListFooterContent,
			initialUnreadCount: context.conversationsUnread,
			activationLink: context.conversationsLink,
			endlessScroll: true,
			titleCount: true,
			cssClass: 'conversations',
			unreadCountMessageSingular: context.conversationsUnreadCountMessageSingular,
			unreadCountMessagePlural: context.conversationsUnreadCountMessagePlural,
			wrapper: context.banner,
			handheldBannerLinksCount: context.handheldBannerLinksCount,
			onLoad: function (pageIndex, shouldRefreshUnreadCount, filter, complete, onPreLoad) {
				if (onPreLoad) {
					onPreLoad();
				}
				$.telligent.evolution.get({
					url: context.conversationsUrl,
					data: {
						w_pageIndex: pageIndex
					},
					success: function (response) {
						// show response
						complete(response);
						// update count
						if (shouldRefreshUnreadCount)
							context.conversationsList.refreshUnreadCount();
					}
				});

				context.conversationsList.content().on('click', '.mark a, .mark-all a', function (e) {
					e.preventDefault();
					var markLink = $(e.target);
					var item = $(this).closest('li');
					if (item.hasClass('content-item-header')) {
						markAllAsRead();
					} else {
						var conversationId = item.data('conversationid');
						markAsRead(conversationId).then(function () {
							markLink.hide();
							item.removeClass('unread');
							item.fadeOut(200, function () {
								item.remove();
								cleanUpAfterRemoval();
							});
							context.conversationsList.refreshUnreadCount();
						});
					}
					return false;
				});

			},
			onRefreshUnreadCount: function (complete) {
				if ($.telligent.evolution.user.accessing.isSystemAccount || $.telligent.evolution.user.accessing.isTemporary) {
					complete(0);
					return;
				}

				return $.telligent.evolution.get({
					url: $.telligent.evolution.site.getBaseUrl() + 'api.ashx/v2/conversations.json',
					cache: false,
					data: {
						ReadStatus: 'Unread'
					},
					success: function (response) {
						complete(response.TotalCount);
					},
					error: {}
				});
			},
			template: context.conversationsTemplate,
			onShow: function (activator, complete) {
				complete(buildShowSettings(context, activator, {}));
			}
		});

		// update the message list's count when a new notification is received which is a conversation type
		$.telligent.evolution.messaging.subscribe('notification.raised', function (notification) {
			if (notification.typeId === context.conversationNotificationTypeId) {
				context.conversationsList.refreshUnreadCount().then(function () {
					context.conversationsList.refreshContent();
				});
			}
		});

		$.telligent.evolution.messaging.subscribe('notification.read', function (notification) {
			if (notification.typeId === context.conversationNotificationTypeId) {
				clearTimeout(debouncedNotificationReadTimeout);
				debouncedNotificationReadTimeout = setTimeout(function () {
					if (suppressNotificationsReadMessage) {
						return;
					}
					context.conversationsList.refreshUnreadCount().then(function () {
						context.conversationsList.refreshContent();
					});
				}, 100);
			}
		});

		// update the message list's count when a message was read on the conversation list
		$.telligent.evolution.messaging.subscribe('ui.messageread', function (notification) {
			context.conversationsList.refreshUnreadCount();
		});

		if (context.conversationNewConversationUrl) {
			$.telligent.evolution.messaging.subscribe(context.messagePrefix + 'startconversation', function () {
				global.location = context.conversationNewConversationUrl;
			});
		}


		return context.conversationsList;
	}

	function initBookmarksList(context) {
		// gets all selected content types from the content type filter
		function getCurrentContentTypes(bookmarkFilter) {
			var contentTypes = [];
			var selectedFilters = context.bookmarkFilter.find('a.selected').each(function () {
				contentTypes.push($(this).data('contenttypeids'));
			});
			return contentTypes.join(',');
		};

		context.bookmarksList = HeaderList({
			activateMessage: context.activateMessage,
			deactivateMessage: context.deactivateMessage,
			key: 'bookmarks',
			footerContent: context.bookmarksListFooterContent,
			activationLink: context.bookmarksLink,
			endlessScroll: true,
			initialUnreadCount: context.bookmarksIsBookmarked ? 1 : 0,
			titleCount: false,
			showCount: false,
			cssClass: 'bookmarks',
			wrapper: context.banner,
			handheldBannerLinksCount: context.handheldBannerLinksCount,
			unreadCountMessageSingular: context.bookmarksBookmarks,
			unreadCountMessagePlural: context.bookmarksBookmarks,
			onLoad: function (pageIndex, shouldRefreshUnreadCount, filter, complete, onPreLoad) {
				var filteredContentTypeIds = filter || getCurrentContentTypes(context.bookmarkFilter);
				if (onPreLoad) {
					onPreLoad();
				}
				$.telligent.evolution.get({
					url: context.bookmarksUrl,
					data: {
						w_pageIndex: pageIndex,
						w_contentTypeIds: filteredContentTypeIds
					},
					success: function (response) {
						if (filteredContentTypeIds && filteredContentTypeIds.length > 0 && getCurrentContentTypes(context.bookmarkFilter) !== filteredContentTypeIds)
							return;
						// show response
						complete(response);
						// update count
						if (shouldRefreshUnreadCount)
							context.bookmarksList.refreshUnreadCount();
					}
				});
			},
			onRefreshUnreadCount: function (complete) {
				complete(context.bookmarksIsBookmarked ? 1 : 0);
			},
			onBuildFilter: function (filtered) {
				var filterTemplate = $.telligent.evolution.template.compile(context.bookmarksFilterTemplate),
					filterTemplateData = {
						contentTypeIds: '',
						applicationContentTypeIds: '',
						containerTypes: []
					};
				if (context.bookmarksContentTypes.length > 0)
					filterTemplateData.contentTypeIds = context.bookmarksContentTypes.substr(0, context.bookmarksContentTypes.length - 1)
				if (context.bookmarksApplicationContentTypes.length > 0)
					filterTemplateData.applicationContentTypeIds = context.bookmarksApplicationContentTypes.substr(0, context.bookmarksApplicationContentTypes.length - 1)
				if (context.bookmarksContainerContentTypes.length > 0) {
					var rawContainers = context.bookmarksContainerContentTypes.split(',');
					$.each(rawContainers, function (i, rawContainer) {
						if (rawContainer && rawContainer.length > 0) {
							var containerComponents = rawContainer.split(':', 2);
							if (containerComponents.length === 2) {
								filterTemplateData.containerTypes.push({
									name: containerComponents[1],
									id: containerComponents[0]
								});
							}
						}
					});
				}

				context.bookmarkFilter = $(filterTemplate(filterTemplateData));
				context.bookmarkFilter.find('a').first().addClass('selected');
				context.bookmarkFilter.on('click', 'a', function (e) {
					e.preventDefault();
					e.stopPropagation();
					var target = $(e.target);
					target.closest('ul').find('a').removeClass('selected');
					target.addClass('selected');
					filtered(getCurrentContentTypes(context.bookmarkFilter));
				});

				return context.bookmarkFilter;
			},
			template: context.bookmarksTemplate,
			onShow: function (activator, complete) {
				complete(buildShowSettings(context, activator, {}));
			}
		});

		// refresh content when bookmarks are added/removed
		$.telligent.evolution.messaging.subscribe('ui.bookmark', function (data) {
			// if this represents a change in bookmark state of current content,
			// track that
			if (data.contentId == context.bookmarksCurrentContentId) {
				context.bookmarksIsBookmarked = data.bookmarked;
				context.bookmarksList.refreshUnreadCount();
				if (data.bookmarked) {
					context.bookmarksLink.addClass('bookmarked');
					$.telligent.evolution.notifications.show(context.bookmarkAdded, {
						id: 'bookmark-' + data.contentId
					});
				} else {
					context.bookmarksLink.removeClass('bookmarked');
					$.telligent.evolution.notifications.show(context.bookmarkRemoved, {
						id: 'bookmark-' + data.contentId
					});
				}
			}
			context.bookmarksList.refreshContent();
		});

		if (context.bookmarksIsBookmarked)
			context.bookmarksLink.addClass('bookmarked');

		return context.bookmarksList;
	}

	function initUserPopup(context) {
		var userContent = $($.telligent.evolution.template.compile(context.userContentTemplate)());

		context.userPopup = HeaderList({
			activateMessage: context.activateMessage,
			deactivateMessage: context.deactivateMessage,
			key: 'user',
			activationLink: context.userLink,
			endlessScroll: false,
			titleCount: false,
			cssClass: 'user',
			showCount: false,
			wrapper: context.banner,
			handheldBannerLinksCount: context.handheldBannerLinksCount,
			onLoad: function (pageIndex, shouldRefreshUnreadCount, filter, complete) {
				global.setTimeout(function () {
					complete(userContent)
				}, 10)
			},
			template: context.userPopupTemplate,
			onShow: function (activator, complete) {
				complete(buildShowSettings(context, activator, {}));
			}
		});

		return context.userPopup;
	};

	function initSearchPopup(context) {

		var previousQueryKey = 'tc:previous-query';

		function getUrl() {
			return [ location.host, location.pathname ].join('');
		}

		// Get the previously-searched query from the current URL and remove it
		function getPreviousQuery(context) {
			var previousQuery = sessionStorage.getItem(previousQueryKey);
			if (previousQuery) {
				var deserializedPreviousQuery = JSON.parse(previousQuery);
				if (deserializedPreviousQuery.url == getUrl()) {
					sessionStorage.removeItem(previousQueryKey);
					return deserializedPreviousQuery;
				}
			} else {
				return null;
			}
		}

		// Persist the last searched query for the current URL
		function setPreviousQuery(context) {
			var searchFilters = getCurrentSearchFilters(context);
			var previousQuery = {
				placeKey: searchFilters.placeKey,
				placeValue: searchFilters.placeValue,
				category: searchFilters.category,
				query: searchFilters.query,
				url: getUrl()
			};
			sessionStorage.setItem(previousQueryKey, JSON.stringify(previousQuery));
		}

		// gets all selected content types from the content type filter
		function getCurrentSearchFilters(context) {
			var selectedPlace = context.searchFilter.find('a.place.selected');
			var selectedType = context.searchFilter.find('a.type.selected');
			var selectedCategory = context.searchFilter.find('a.category.selected');

			var filters = {
				placeKey: selectedPlace.data('key') || 'anywhere',
				placeValue: selectedPlace.data('value') || 'anywhere',
				type: selectedType.data('key'),
				category: selectedCategory.data('key'),
				query: $.trim(context.searchInput.val()),
				searchParameter: selectedPlace.data('searchparam'),
				searchValue: selectedPlace.data('searchvalue')
			}

			var t = $.grep(context.searchFilters, function (e) {
				return e.key == selectedType.data('key');
			})[0];
			if (t && t.advancedSearchUrl) {
				filters.advancedSearchUrl = t.advancedSearchUrl;
			}

			return filters;
		};

		function loadSearchPlaces(context) {
			var places = [];

			if (context.searchPlaceApplicationId) {
				places.push({
					key: 'application',
					value: context.searchPlaceApplicationId,
					name: context.searchPlaceApplicationName,
					searchParameter: 'group',
					searchValue: context.searchPlaceGroupLocalId
				});
			}

			if (context.searchPlaceGroupId) {
				places.push({
					key: 'group',
					value: context.searchPlaceGroupId,
					name: context.searchPlaceGroupName,
					searchParameter: 'group',
					searchValue: context.searchPlaceGroupLocalId
				});
			}

			if (places.length > 0) {
				places.push({
					key: 'anywhere',
					value: 'anywhere',
					name: context.searchPlaceAnywhereName,
					searchParameter: '',
					searchValue: ''
				});
			}

			context.searchPlaces = places;
		}

		function loadSearchFilters(context, scope) {
			var filters = [];

			// build first party filters first
			filters.push({
				key: 'content',
				name: context.searchFilterContentName,
				searchParameter: '',
				searchValue: ''
			});

			// add custom filters
			var i = 1;
			$.telligent.evolution.messaging.publish('search.registerFilters', {
				scope: scope,
				register: function (settings) {
					filters.push($.extend({
							name: '',
							query: function (queryData, complete) {},
							advancedSearchUrl: function (queryText) {
								return null;
							},
							isDefault: false,
							searchParameter: '',
							searchValue: ''
						},
						settings, {
							key: 'custom' + (i++)
						}
					));
				}
			});

			context.searchFilters = filters;
		};

		function setDefaultAdvancedSearchUrl(context) {

			var filter = getCurrentSearchFilters(context);

			var query = $.trim(filter.query);
			if (query && query.length > 0) {
				var params = {
					q: query
				};

				if (filter.searchParameter && filter.searchValue) {
					params[filter.searchParameter] = filter.searchValue;
				}

				if (filter.category != null) {
					params["category"] = filter.category;
				}

				context.currentAdvancedSearchUrl = context.searchAdvancedUrl
					.replace(/\{0\}/gi, $.param(params))
					.replace(/\+/gi, '%20')
					.replace(/'/gi, '%27');
				$('#' + context.advancedSearchId).css('visibility', 'visible');
			} else {
				$('#' + context.advancedSearchId).css('visibility', 'hidden');
			}
		}

		function setAdvancedUserSearchUrl(context) {

			var filter = getCurrentSearchFilters(context);

			var query = $.trim(filter.query);
			if (query && query.length > 0) {
				var params = {
					q: query
				};

				if (filter.searchParameter && filter.searchValue) {
					params[filter.searchParameter] = filter.searchValue;
				}

				if (filter.category != null) {
					params["category"] = filter.category;
				}

				context.currentAdvancedSearchUrl = context.searchAdvancedUserUrl
					.replace(/\{0\}/gi, $.param(params))
					.replace(/\+/gi, '%20')
					.replace(/'/gi, '%27');
				$('#' + context.advancedSearchId).css('visibility', 'visible');
			} else {
				$('#' + context.advancedSearchId).css('visibility', 'hidden');
			}
		}

		// default to supporting inlineSearch though search.ready can override it
		context.supportsInlineSearch = true;

		setTimeout(function () {
			$.telligent.evolution.messaging.publish('search.ready', {
				init: function (settings) {
					var injectedSettings = $.extend({
						customResultRendering: false,
						initialQuery: null,
						placeholder: null
					}, settings);
					context.supportsInlineSearch = !injectedSettings.customResultRendering;
					if (injectedSettings.initialQuery !== null) {
						context.searchInput.val(injectedSettings.initialQuery);
					}
					if (injectedSettings.placeholder !== null) {
						context.searchInput.attr('placeholder', injectedSettings.placeholder);
					}
				}
			});
		}, 50);

		function buildSearchDataFromEffectiveQuery(pageIndex, effectiveSearchFilter, explicitPreviousSearchQueryCategory) {
			return {
				w_pageIndex: pageIndex,
				w_query: effectiveSearchFilter.query,
				w_placeKey: effectiveSearchFilter.placeKey,
				w_placeValue: effectiveSearchFilter.placeValue,
				w_type: effectiveSearchFilter.type,
				w_category: explicitPreviousSearchQueryCategory || effectiveSearchFilter.category
			};
		}

		context.searchPopup = HeaderList({
			activateMessage: context.activateMessage,
			deactivateMessage: context.deactivateMessage,
			key: 'search',
			footerContent: context.searchFooterContent,
			activationInput: context.searchInput,
			endlessScroll: true,
			titleCount: false,
			showCount: false,
			cssClass: 'search',
			wrapper: context.banner,
			handheldBannerLinksCount: context.handheldBannerLinksCount,
			onShowLoadingIndicator: function () {
				return context.supportsInlineSearch;
			},
			onLoad: function (pageIndex, shouldRefreshUnreadCount, filter, complete, onPreLoad) {
				if (!context.supportsInlineSearch)
					return;

				// if there was a previous search query with a place,
				// pre-select its place before the first result set is loaded
				if (context.previousSearchQuery && context.previousSearchQuery.placeKey) {
					context.searchFilter.find('a.place.selected').removeClass('selected');
					context.searchFilter.find('a.place[data-key="' + context.previousSearchQuery.placeKey + '"][data-value="' + context.previousSearchQuery.placeValue + '"]').addClass('selected');
				}

				var effectiveSearchFilter = filter || getCurrentSearchFilters(context);

				// if the previous query included a category, override to use it
				var previousSearchQueryCategory = null;
				if (context.previousSearchQuery && context.previousSearchQuery.category) {
					effectiveSearchFilter.category = context.previousSearchQuery.category;
					previousSearchQueryCategory = context.previousSearchQuery.category;
				}

				// dispose of previous query after first use
				context.previousSearchQuery = null;

				// prevent empty searches
				if (!effectiveSearchFilter.query || effectiveSearchFilter.query.length == 0) {
					complete('');
					return;
				}

				var filter = $.grep(context.searchFilters, function (e) {
					return e.key == effectiveSearchFilter.type
				})[0];
				if (filter && filter.query) {
					filter.query({
						pageIndex: pageIndex,
						query: effectiveSearchFilter.query
					}, function (response) {
						complete(response);
						context.searchInput.addClass('with-results');

						if (!context.currentAdvancedSearchUrl) {
							$('#' + context.advancedSearchId).css('visibility', 'hidden');
						} else {
							$('#' + context.advancedSearchId).css('visibility', 'visible');
						}
					});
				} else {

					var queryData = buildSearchDataFromEffectiveQuery(pageIndex, effectiveSearchFilter)
					if (context.lastSearchQuery && JSON.stringify(queryData) == JSON.stringify(context.lastSearchQuery) && false) {
						complete(null);
						return;
					}
					context.lastSearchQuery = queryData;
					if (onPreLoad) {
						onPreLoad();
					}

					$.telligent.evolution.get({
						url: context.searchUrl,
						data: queryData,
						success: function (response) {
							// after results return, make sure the current search parameters
							// would still match the request that made this query
							// If not, ignore the results

							var currentEffectiveSearchFilter = getCurrentSearchFilters(context);
							if (!currentEffectiveSearchFilter || !currentEffectiveSearchFilter.query || currentEffectiveSearchFilter.query.length == 0) {
								complete(null);
								return;
							}
							var currentQueryData = buildSearchDataFromEffectiveQuery(pageIndex, currentEffectiveSearchFilter, previousSearchQueryCategory);
							previousSearchQueryCategory = null;
							if(!currentQueryData.w_pageIndex &&
								currentQueryData.w_pageIndex == queryData.w_pageIndex &&
								$.telligent.evolution.url.serializeQuery(currentQueryData) != $.telligent.evolution.url.serializeQuery(queryData)
							)
							{
								complete(null);
								return;
							}

							if (response.categoryId != null && response.categoryId == "user") {
								setAdvancedUserSearchUrl(context);
							} else {
								setDefaultAdvancedSearchUrl(context);
							}

							// show response
							complete(response.renderedResults);
							context.searchInput.addClass('with-results');
						}
					});
				}
			},
			onRefreshUnreadCount: function (complete) {
				complete(0);
			},
			onBuildFilter: function (filtered) {
				loadSearchPlaces(context);
				loadSearchFilters(context, context.searchPlaces.length > 0 ? context.searchPlaces[0] : {
					key: 'anywhere',
					value: 'anywhere'
				});

				var filterTemplate = $.telligent.evolution.template.compile(context.searchFilterTemplate),
					filterTemplateData = {
						contentTypeIds: '',
						applicationContentTypeIds: '',
						containerTypes: [],
						filters: context.searchFilters,
						places: context.searchPlaces
					};

				context.searchFilter = $('<div class="search-filters"></div>').hide().appendTo('body');
				$(filterTemplate(filterTemplateData)).appendTo(context.searchFilter);

				var filter = $.grep(context.searchFilters, function (e) {
					return e.isDefault;
				})[0];
				if (filter) {
					context.searchFilter.find('a.type[data-key="' + filter.key + '"]').addClass('selected');
				} else {
					context.searchFilter.find('a.type:first').addClass('selected');
				}

				context.searchFilter.find('a.place:first').addClass('selected');
				context.searchFilter.on('click', 'a', function (e) {
					e.preventDefault();
					e.stopPropagation();
					var target = $(e.target);
					target.closest('ul').find('a').removeClass('selected');
					target.addClass('selected');

					if (target.hasClass('place')) {
						var key = target.data('key'),
							value = target.data('value');

						loadSearchFilters(context, {
							key: key,
							value: value
						});

						context.searchFilter.empty().append($(filterTemplate({
							contentTypeIds: '',
							applicationContentTypeIds: '',
							containerTypes: [],
							filters: context.searchFilters,
							places: context.searchPlaces
						})));

						var filter = $.grep(context.searchFilters, function (e) {
							return e.isDefault;
						})[0];
						if (filter) {
							context.searchFilter.find('a.type[data-key="' + filter.key + '"]').addClass('selected');
						} else {
							context.searchFilter.find('a.type:first').addClass('selected');
						}

						context.searchFilter.find('a.place[data-key="' + key + '"][data-value="' + value + '"]').addClass('selected');
					}

					filtered(getCurrentSearchFilters(context));

					var filter = getCurrentSearchFilters(context);
					if (filter && filter.advancedSearchUrl)
						context.currentAdvancedSearchUrl = filter.advancedSearchUrl(filter.query);
					else
						setDefaultAdvancedSearchUrl(context);
				});

				var lastQuery = null;
				context.searchInput.on({
					input: util.debounce(function (e) {
						var filter = getCurrentSearchFilters(context);
						if (filter.query == lastQuery) {
							e.preventDefault()
							return false;
						}
						lastQuery = filter.query;
						filtered(filter);
						$.telligent.evolution.messaging.publish('search.query', {
							value: $.trim(context.searchInput.val())
						});
					}, 600),
					click: function (e) {
						if (!supportsTouch())
							return false;
					}
				});
				context.searchInput.on({
					input: function (e) {
						var filter = getCurrentSearchFilters(context);
						if (filter && filter.advancedSearchUrl)
							context.currentAdvancedSearchUrl = filter.advancedSearchUrl(filter.query);
						else
							setDefaultAdvancedSearchUrl(context);
					}
				});

				return context.searchFilter.show();
			},
			template: context.searchTemplate,
			onShow: function (activator, complete) {
				// make search open 100% wide, and 70% of the height of the viewport
				complete(buildShowSettings(context, activator, {
					attachTo: context.banner,
					width: context.banner.width() - 2,
					maxHeight: ($(global).height() * .7),
					cssClass: 'search-container'
				}));
			},
			onHide: function () {
				context.searchInput.removeClass('with-results');
				context.lastSearchQuery = null;
			},
			onSelect: function (item, fromLink) {
				setPreviousQuery(context);

				if (fromLink)
					return true;

				var url = $(item).data('contenturl');
				if (url) {
					window.location = url;
				}
			}
		});

		// advanced search
		function redirectToAdvancedSearch() {
			if (context.supportsInlineSearch && !context.currentAdvancedSearchUrl)
				setDefaultAdvancedSearchUrl(context);
			if (context.currentAdvancedSearchUrl) {
				setPreviousQuery(context);
				window.location = context.currentAdvancedSearchUrl;
			}
		}
		$.telligent.evolution.messaging.subscribe(context.messagePrefix + 'advancedsearch', redirectToAdvancedSearch);

		// if not touch, support enter to use advanced search
		$(context.searchInput).on('keydown', function (e) {
			if (e.which === 13) {
				if (!context.supportsInlineSearch || !$('body').hasClass('touch')) {
					e.preventDefault();
					e.stopPropagation();
					// if there's a selected item, redirect to it, otherwise redirect to advanced search
					var selectedItem = context.searchPopup.content().children('li.content-item.selected');
					if (selectedItem.length > 0) {
						selectedItem.trigger('click');
					} else {
					    // SiteCatalyst Tracking
					    _TrackSC(window.location, "Search");
						redirectToAdvancedSearch();
					}
					if ($('body').hasClass('touch')) {
						context.searchInput.trigger('blur');
					}
					return false;
				} else {
					context.searchInput.trigger('blur');
					e.preventDefault();
					e.stopImmediatePropagation();
					return false;
				}
			};
		});

		// get any previous search query and apply its text query
		context.previousSearchQuery = getPreviousQuery(context);
		if (context.previousSearchQuery && context.previousSearchQuery.query) {
			context.searchInput.val(context.previousSearchQuery.query);
		}

		return context.searchPopup;
	}

	// returns show settings to use for header popups
	function buildShowSettings(context, activator, settings) {
		if ($(window).width() <= 570) {
			return {
				attachTo: context.banner,
				width: context.banner.width(),
				maxHeight: $(global).height() / 2
			};
		} else {
			return settings;
		}
	}

	function initSiteNavigation(context) {
		context.siteNavigationList = HeaderList({
			activateMessage: context.activateMessage,
			deactivateMessage: context.deactivateMessage,
			key: 'site',
			activationLink: context.siteNavigationLink,
			endlessScroll: true,
			titleCount: false,
			cssClass: ('site ' + (context.siteNavigationType === 'my_groups' ? 'group' : context.siteNavigationType) + ' ' + (context.siteNavigationType == 'custom' ? 'without-avatar' : '')),
			wrapper: context.banner,
			unreadCountMessagePlural: context.siteNavigationTitle,
			unreadCountMessageSingular: context.siteNavigationTitle,
			onLoad: function (pageIndex, shouldRefreshUnreadCount, filter, complete, onPreLoad) {
				if (onPreLoad) {
					onPreLoad();
				}
				$.telligent.evolution.get({
					url: context.siteNavigationUrl,
					data: {
						w_siteNavigationType: context.siteNavigationType,
						w_pageIndex: pageIndex
					},
					success: function (response) {
						complete(response);
					}
				});
			},
			onRefreshUnreadCount: function (complete) {
				complete(0);
			},
			template: context.siteNavigationTemplate,
			onShow: function (activator, complete) {
				complete(buildShowSettings(context, activator, {}));
			}
		});

		if (context.siteNavigationCustomItems &&
			context.siteNavigationCustomItems.length > 0) {
			setTimeout(function () {
				$.telligent.evolution.messaging.publish('navigation.siteNavigationContent', {
					items: context.siteNavigationCustomItems
				});
			}, 100);
		}

		return context.siteNavigationList;
	}

	function mobileInitSearch(context) {
		if (context.handheldSearchFieldsLink && context.handheldSearchFieldsLink.is(':visible') && context.searchInput.val().length > 0) {
			setTimeout(function () {
				context.handheldSearchFieldsLink.trigger('click');
			}, 100);
		}
	}

	function initHandheldLinks(context) {
		var openHandheldContainer = null,
			activeLink, open = false;

		function registerHandheldLink(link, container, onShow, onHide) {
			link.on('click', function (e) {
				e.preventDefault();
				if (openHandheldContainer && openHandheldContainer == container) {
					if (activeLink)
						activeLink.removeClass('active');
					onHide();
					open = false;
					if (openHandheldContainer)
						openHandheldContainer.hide();
					openHandheldContainer = null;
				} else if (openHandheldContainer) {
					if (activeLink)
						activeLink.removeClass('active');
					onHide();
					open = false;
					if (openHandheldContainer)
						openHandheldContainer.hide();
					openHandheldContainer = container;
				} else {
					openHandheldContainer = container;
				}
				if (openHandheldContainer !== null) {
					openHandheldContainer.show();
					onShow();
					open = true;
					if (activeLink)
						activeLink.removeClass('active');
					activeLink = link.addClass('active');
				} else {
					onShow();
					open = false;
					if (activeLink)
						activeLink.removeClass('active');
					activeLink = link.addClass('active');
				}
			});
		}

		registerHandheldLink(context.handheldSiteLinksLink, null,
			function () {
				context.handheldSiteLinksLink.addClass('active');
				context.siteNavigationLink.trigger('click');
			},
			function () {
				context.handheldSiteLinksLink.removeClass('active');
				context.siteNavigationLink.trigger('click');
			});
		registerHandheldLink(context.handheldSearchFieldsLink, context.handheldSearchFields,
			function () {
				context.searchFields.contents().appendTo(context.handheldSearchFields);
				// focus on search
				context.searchInput.trigger('focus');
				// scroll to top (iOS requires this... )
				global.scrollTo(0, 0);
			},
			function () {
				context.handheldSearchFields.contents().appendTo(context.searchFields);
			});
		registerHandheldLink(context.handheldBannerLinksLink, context.handheldBannerLinks,
			function () {
				context.bannerLinks.contents().appendTo(context.handheldBannerLinks);
			},
			function () {
				context.handheldBannerLinks.contents().appendTo(context.bannerLinks);
			});
	}

	function registerPopup(context, popup, key) {
		context.popupList = context.popupList || [];
		context.popups = context.popups || {};

		var index = context.popupList.length;
		context.popupList.push(popup);
		context.popups[key] = {
			popup: popup,
			index: index
		};
	}

	function initKeyboardEvents(context) {
		var isActive = false;
		var currentIndex = null;

		$.telligent.evolution.messaging.subscribe(context.activateMessage, function (data) {
			isActive = true;
			currentIndex = context.popups[data.key].index;
			if (data.key == 'search' && context.searchInput) {
				setTimeout(function () {
					context.searchInput.trigger('focus');
				}, 10)
			}
		});
		$.telligent.evolution.messaging.subscribe(context.deactivateMessage, function (data) {
			if (data.key != 'search') {
				isActive = false;
			}
		});
		var body = document.body,
			doc = document,
			win = window,
			currentSelection = null;

		var keys = {
			enter: 13,
			esc: 27,

			slash: 191,

			up: 38,
			p: 80,
			k: 75,

			down: 40,
			n: 78,
			j: 74,

			left: 37,
			right: 39,
			h: 72,
			l: 76
		};

		function blockKey(e) {
			e.preventDefault();
			e.stopPropagation();
		}

		function getCaret(el) {
			if (el.selectionStart) {
				return el.selectionStart;
			} else if (document.selection) {
				el.focus();
				var r = document.selection.createRange();
				if (r == null) {
					return 0;
				}
				var re = el.createTextRange(),
					rc = re.duplicate();
				re.moveToBookmark(r.getBookmark());
				rc.setEndPoint('EndToStart', re);
				return rc.text.length;
			}
			return 0;
		}

		$('body').on('click', function (e) {
			var isBannerTarget = $(e.target).closest(context.wrapper + ', .popup-list').length > 0;
			if (!isBannerTarget) {
				var currentPopup = context.popupList[currentIndex];
				isActive = false;
				if (currentPopup)
					currentPopup.deactivate();
				if (context.searchInput)
					context.searchInput.trigger('blur');
				currentSelection = null;
			}
		})

		$(document).on('keydown', function (e) {
			var isWindowEvent = (e.target == body || e.target == doc || e.target == win);
			var isBannerEvent = $(e.target).closest(context.wrapper + ', .popup-list').length > 0;

			if (isActive) {
				var currentPopup = context.popupList[currentIndex];

				if (!isBannerEvent && !isWindowEvent) {
					isActive = false;
					if (currentPopup)
						currentPopup.deactivate();
					if (context.searchInput)
						context.searchInput.trigger('blur');
					currentSelection = null;
					return true;
				}

				if (!currentPopup) {
					return true;
				}

				var isCursorInStart = !context.searchInput || context.searchInput.is(":not(:focus)") || getCaret(context.searchInput[0]) == 0;
				var isCursorInEnd = !context.searchInput || context.searchInput.is(":not(:focus)") || getCaret(context.searchInput[0]) == context.searchInput.val().length;

				// left/right to change current open popup
				if ((e.which == keys.left && isCursorInStart && !(e.ctrlKey || e.metaKey)) ||
					(e.which == keys.h && currentPopup !== context.searchPopup)) {
					blockKey(e);
					currentPopup.deactivate();
					if (context.searchInput)
						context.searchInput.trigger('blur');
					currentIndex--;
					if (currentIndex < 0) {
						currentIndex = context.popupList.length - 1;
					}

					currentPopup = context.popupList[currentIndex];
					currentPopup.activate();
				} else if ((e.which == keys.right && isCursorInEnd && !(e.ctrlKey || e.metaKey)) ||
					(e.which == keys.l && currentPopup !== context.searchPopup)) {
					blockKey(e);
					currentPopup.deactivate();
					if (context.searchInput)
						context.searchInput.trigger('blur');
					currentIndex++;
					if (currentIndex >= context.popupList.length) {
						currentIndex = 0;
					}

					currentPopup = context.popupList[currentIndex];
					currentPopup.activate();
				}

				// up
				else if (e.which == keys.up ||
					((e.which == keys.p || e.which == keys.k) && (currentPopup !== context.searchPopup))) {
					blockKey(e);
					currentPopup.moveUp(function (item) {
						currentSelection = item;
					});
				}

				// down
				else if (e.which == keys.down ||
					((e.which == keys.n || e.which == keys.j) && (currentPopup !== context.searchPopup))) {
					blockKey(e);
					currentPopup.moveDown(function (item) {
						currentSelection = item;
					});
				}

				// select
				else if (e.which == keys.enter) {
					blockKey(e);
					if (currentSelection) {
						currentSelection.trigger('click');
					}
				}

			}
		});

		$.telligent.evolution.shortcuts.register(['SLASH', 'ALT + SLASH'], function (e) {
			if (!e.isInput || e.combination === 'ALT + SLASH') {
				$.telligent.evolution.shortcuts.captureFocus();
				setTimeout(function () {
					context.searchInput.get(0).focus();
				}, 10);
				isActive = true;
				currentIndex = context.popups['search'].index;
				return false;
			}
		}, {
			description: context.searchText
		});

		$.telligent.evolution.shortcuts.register('ESC', function (e) {
			if (isActive || context.searchInput.is(':focus')) {
				isActive = false;
				$.telligent.evolution.shortcuts.refocus();
				var currentPopup = context.popupList[currentIndex];
				if (currentPopup)
					currentPopup.deactivate();
				currentSelection = null;
			}
		});
	}

	function initReconnectionHandling(context) {
		// on reconnect, refresh unread notifications and conversations
		$.telligent.evolution.messaging.subscribe('socket.reconnected', function () {
			context.notificationsList.refreshUnreadCount().then(function () {
				context.notificationsList.refreshContent();
			});
			context.conversationsList.refreshUnreadCount().then(function () {
				context.conversationsList.refreshContent();
			});
		});
	}

	var api = {
		register: function (context) {
			context.activateMessage = context.messagePrefix + activateMessage;
			context.deactivateMessage = context.messagePrefix + deactivateMessage;

			if (context.siteNavigationLink && context.siteNavigationLink.length > 0)
				registerPopup(context, initSiteNavigation(context), 'site');

			if (context.searchInput && context.searchInput.length > 0)
				registerPopup(context, initSearchPopup(context), 'search');

			if (context.notificationsLink && context.notificationsLink.length > 0)
				registerPopup(context, initNotificationList(context), 'notifications');

			if (context.conversationsLink && context.conversationsLink.length > 0)
				registerPopup(context, initConversationList(context), 'conversations');

			if (context.bookmarksLink && context.bookmarksLink.length > 0)
				registerPopup(context, initBookmarksList(context), 'bookmarks');

			if (context.userLink && context.userLink.length > 0)
				registerPopup(context, initUserPopup(context), 'user');

			if (context.viewType == 'all')
				initHandheldLinks(context);

			initReconnectionHandling(context);

			mobileInitSearch(context);

			initKeyboardEvents(context);
		}
	};

	$.telligent = $.telligent || {};
	$.telligent.evolution = $.telligent.evolution || {};
	$.telligent.evolution.widgets = $.telligent.evolution.widgets || {};
	$.telligent.evolution.widgets.siteBanner = api;

}(jQuery, window));