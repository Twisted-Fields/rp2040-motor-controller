(function($) {
	if (typeof $.telligent === 'undefined') { $.telligent = {}; }
	if (typeof $.telligent.evolution === 'undefined') { $.telligent.evolution = {}; }
	if (typeof $.telligent.evolution.widgets === 'undefined') { $.telligent.evolution.widgets = {}; }

	var registered = false,
		openDelay = 300,
		closeDelay = 400,
		open = function(context, element) {
			var hoveredElement = element;
			if(context.currentElement === element) {
				return;
			}
			// if no longer over, don't even bother
			// if(!$(hoveredElement).data('over')) { return }

			// if a different hover is already open, then first close it
			if (context.currentElement &&
				context.currentElement !== element) {
				close(context, context.currentElement);
			}
			// if this is a request to re-open the current open panel, ignore it
			if ((context.currentElement &&
				context.currentElement === element &&
				context.popup.glowPopUpPanel('isShown')) ||
				$(element).closest('.user-info-popup-content').length > 0) {
				return;
			}
			context.currentElement = element;
			context.popup.glowPopUpPanel('hide').glowPopUpPanel('html', '');

			// if the element that triggered this is no longer visible, don't show
			if($(element).css('display') === 'none') {
				return;
			}
			var profileMatches = context.profileUrlPattern.exec(element.href);
			if(profileMatches === null) { return; }

			var userName = profileMatches[1];

			var userHtml = context.userCache[userName];
			if (userHtml) {
				context.popup
					.glowPopUpPanel('html', userHtml)
					.glowPopUpPanel('show', element);
				return;
			}

			$.telligent.evolution.get({
				url: context.getUserInformationUrl,
				data: { w_hoverUserName: userName },
				success: function(response)
				{
					// if no longer over after ajax callback, don't even bother
					if($(hoveredElement).data('over')) {
						context.userCache[userName] = response;
						context.current = element;

						context.popup
							.glowPopUpPanel('html', response)
							.glowPopUpPanel('show', element);
					}
				}
			});
		},
		currentDirection = null,
		close = function(context) {
			if(!context.over) {
				context.popup.glowPopUpPanel('hide');
				context.currentElement = null;
			}
		},
		optOut = function(jqElm) {
			return jqElm.data('userhover') == 'ignore';
		};

	$.telligent.evolution.widgets.userHover = {
		register: function(context) {
			// only register once on a given page
			if(!registered) {
				registered = true;

				context.userCache = {};

				context.popup = $('<div></div>')
					.glowPopUpPanel({
						cssClass: 'menu user-info-popup-content menu__user-info-popup-content',
						position: 'downcenter',
						zIndex: 20001,
						hideOnDocumentClick: false
					})
					.glowPopUpPanel('html', '');

				$.extend(context, {
					profileUrlPattern: new RegExp('^(?:' + window.location.protocol + '//' + window.location.host + ')?' +
						$.telligent.evolution.site.getBaseUrl() + 'members/([^/]+)(/(?:default\\.aspx)?)?', 'i'),
					avatarUrlPattern: new RegExp('^(?:' + window.location.protocol + '//' + window.location.host + ')?' +
						$.telligent.evolution.site.getBaseUrl() + '.*?_key/Telligent.Evolution.Components.Avatars/([0-9\\.]*)/', 'i')
				});

				$(document)
					.on('mouseenter', '.user-defined-markup a', function(){
						$(this).data('over', true);
					})
					.on('mouseleave', '.user-defined-markup a', function(){
						$(this).data('over', false);
					})
					.on('glowDelayedMouseEnter', '.user-defined-markup a', openDelay, function() {
						var a = $(this);
						if (optOut(a)) {
								return;
						}
						if(!a.attr('core_userhover') && context.profileUrlPattern.test(a.attr('href'))) {
							open(context, a.get(0));
						}
					})
					.on('glowDelayedMouseLeave', '.user-defined-markup a', closeDelay, function(e) {
							if (optOut($(this))) {
								return;
						}
						e.stopPropagation();
						if(!context.current || context.current === e.target) {
							close(context);
						}
					});

				$(document)
					.on('mouseenter', '.internal-link.view-user-profile, .internal-link.view-profile, .avatar > a', function(){
						$(this).data('over', true);
					})
					.on('mouseleave', '.internal-link.view-user-profile, .internal-link.view-profile, .avatar > a', function(){
						$(this).data('over', false);
					})
					.on('glowDelayedMouseEnter', '.internal-link.view-user-profile, .internal-link.view-profile, .avatar > a', openDelay, function() {
							if (optOut($(this))) {
								return;
						}
						open(context, this);
					})
					.on('glowDelayedMouseLeave', '.internal-link.view-user-profile, .internal-link.view-profile, .avatar > a', closeDelay, function(e) {
							if (optOut($(this))) {
								return;
						}
						e.stopPropagation();
						if(!context.current || context.current === e.target) {
							close(context);
						}
					});
				$(document)
					.on('mouseenter', 'div.user-info-popup-content', function(){
						context.over = true;
					})
					.on('glowDelayedMouseLeave', 'div.user-info-popup-content', closeDelay, function(e){
						e.stopPropagation();
						if(!context.userActionsOpen) {
							context.over = false;
							if (context.currentElement == null || !$(context.currentElement).data('over')) {
									close(context);
							}
						}
					});
				$.telligent.evolution.messaging.subscribe('ui.links.show', function(){
					context.over = true;
					context.userActionsOpen = true;
				});
				$.telligent.evolution.messaging.subscribe('ui.links.hide', function(){
					context.over = false;
					context.userActionsOpen = false;
					setTimeout(function(){
						if(!context.over)
							close(context);
					}, closeDelay);
				});
				$(document)
					.on('click', 'div.user-info-popup-content .close a', function(){
						context.over = false;
						close(context);
						return false;
					});
				$(document)
					.on('click', 'div.user-info-popup-content a.start-conversation', function(){
					    _TrackSC(self.location, "Content and Member Engagement");
						var url = $(this).attr('href');
						Telligent_Modal.Open(url,550,360,null);
						return false;
					});

				$(document)
					.on('click', 'div.user-info-popup-content a.add-friend-modal', function(){
					    _TrackSC(self.location, "Content and Member Engagement");
						var url = $(this).attr('href');
						Telligent_Modal.Open(url,550,360,null);
						return false;
					});
				$(document)
					.on('click', 'div.user-info-popup-content a.recent-activity', function(){
						var link = $(this);
						var responseContainer = link.parent();
						var userId = parseInt(link.attr('data-userid'), 10);
						$.telligent.evolution.get({
							url: context.getRecentActivityUrl,
							data: { w_userId: userId },
							success: function(response) {
								var item = $('<div></div>')
									.addClass('recent-activity')
									.html(response)
									.hide()
									.insertAfter(responseContainer);

								responseContainer.glowTransition(item, { duration: 150, complete: function(){
									context.popup.glowPopUpPanel('refresh');
								} });
							}
						});
						return false;
					});
			}
		}
	};
}(jQuery));