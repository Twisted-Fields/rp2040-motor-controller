(function($, global, undef){

	if (!$.telligent) { $.telligent = {}; }
	if (!$.telligent.evolution) { $.telligent.evolution = {}; }
	if (!$.telligent.evolution.widgets) { $.telligent.evolution.widgets = {}; }

	function prefix(options) {
		var data = {};
		$.each(options, function(k, v) {
			data['_w_' + k] = v;
		});
		return data;
	}

	function renderStatistics(context) {
		$(context.statisticsWrapper).html($.telligent.evolution.template(context.statisticsTemplate)({
			commentCount: context.totalComments,
			userCount: context.presentUsers
		}));
	}

	function getBestReplies(context) {
		return $.telligent.evolution.get({
			url: context.listBestUrl
		});
	}

	function createNewRootComment(context, body) {
		if(context.creating)
			return;
		context.creating = true;

		context.loadingIndicator = context.loadingIndicator || $(context.wrapper).find('.processing');
		context.loadingIndicator.show();

		$.telligent.evolution.post({
			url: jQuery.telligent.evolution.site.getBaseUrl() + 'api.ashx/v2/comments.json',
			data: $.extend({
				Body: body,
				ContentId: context.contentId,
				ContentTypeId: context.contentTypeId
			}, context.commentTypeId.length > 0 ? { CommentTypeId: context.commentTypeId } : {})})
			.then(function(response) {
				context.createEditor.val('');
				context.creating = false;
				context.loadingIndicator.hide();
				$.telligent.evolution.messaging.publish('comment.created.root', {
					commentId: response.Comment.CommentId,
					contentId: context.contentId,
					approved: response.Comment.IsApproved
				});
				if(response.Comment.IsApproved) {
					$.telligent.evolution.notifications.show(context.text.successMessage, { duration: 3 * 1000 });
				} else {
					$.telligent.evolution.notifications.show(context.text.moderateMessage, { duration: 5 * 1000 });
				}
			})
			.catch(function() {
				context.creating = false;
				context.loadingIndicator.hide();
			});
	}

	function initCreateRootReplyForm(context) {
		if (document.URL.indexOf('#addcomment') >= 0) {
			setTimeout(function(){
				context.createEditor.focus();
			}, 1000);
		}

		// if there was a previous comment attempt by an anonymous user, post it now
		if(context.tempBody && context.tempBody.length > 0) {
			setTimeout(function(){
				createNewRootComment(context, context.tempBody);
			}, 500);
		}

		context.createEditor.attachOnChange();
	}

	function storeCommentAndLogin(context, body) {
		$.telligent.evolution.post({
			url: context.storeTempDataCallbackUrl,
			data: {
				body: body
			}
		}).then(function (result) {
			var op = (context.loginUrl.indexOf('%3F') > 0) ? '%26' : '%3F';
			window.location = [context.loginUrl, result.tempKey].join(op);
		});
	}

	function validate(context) {
		return $.trim(context.createEditor.val()).length > 0;
	}

	function handleEvents(context) {
		$.telligent.evolution.messaging.subscribe('ui.comments.login', function(data){
			var loginUrl = $.telligent.evolution.url.modify({
				url: context.loginUrl,
				query: {
					ReturnUrl: $.telligent.evolution.url.modify({
						url: $(data.target).data('replyurl'),
						query: {
							focus: 'true'
						}
					})
				}
			});
			global.location.href = loginUrl;
		});

		$.telligent.evolution.messaging.subscribe('comment.created', function(data){
			if (data.contentId == context.contentId) {
				context.totalComments = data.total;
				renderStatistics(context);
			}
		});

		$.telligent.evolution.messaging.subscribe('comment.updated', function(data){
			if (data.contentId == context.contentId) {
				context.totalComments = data.total;
				renderStatistics(context);
			}
		});

		$.telligent.evolution.messaging.subscribe('comment.deleted', function(data){
			if (data.contentId == context.contentId) {
				context.totalComments = data.total;
				renderStatistics(context);
				// remove permalinked comment ID query
				if (data.commentId == context.commentId) {
					var url = $.telligent.evolution.url.modify({ query: { CommentId: null }}).replace('CommentId=', '');
					history.replaceState({}, "", url);
				}
			}
		});

		var presenceUpdateTimeout;
		$.telligent.evolution.messaging.subscribe('comments.presenceChanged', function(data){
			if(data.contentId == context.contentId && data.contentTypeId == context.contentTypeId && (!data.typeId || data.typeId == context.commentTypeId)) {
				global.clearTimeout(presenceUpdateTimeout);
				presenceUpdateTimeout = global.setTimeout(function(){
					loadAndRenderPresentUsers(context);
				}, 20 * 1000);
			}
		});

		$.telligent.evolution.messaging.subscribe('widgets.comments.submit', function(data){
			if(data.from != context.wrapperId)
				return;

			if(!validate(context))
				return;

			var body = $.trim(context.createEditor.val());

			if(data.login) {
				storeCommentAndLogin(context, body);
			} else {
				createNewRootComment(context, body);
			}
		});

		$.telligent.evolution.messaging.subscribe('widgets.comments.typing', function(data){
			if(data.from != context.wrapperId)
				return;

			$.telligent.evolution.sockets.comments.send('typing', $.extend({
				contentId: context.contentId
			}, context.commentTypeId.length > 0 ? { commentTypeId: context.commentTypeId} : {}));
		});

		// when another user votes for a reply in the thread,
		// schedule a throttled update of best replies
		var getBestDelayTimeout;
		$.telligent.evolution.messaging.subscribe('comment.voted', function(data){
			if(context.contentId == data.contentId) {
				// throttle reloading of best replies
				clearTimeout(getBestDelayTimeout);
				getBestDelayTimeout = setTimeout(function(){
					loadAndRenderBestReplies(context);
				}, 15 * 1000);
			}
		});
	}

	function loadAndRenderBestReplies(context) {
		getBestReplies(context).then(function(r){
			if(r && r.bestReplies) {
				$('#' + context.bestRepliesWrapperId).html(r.bestReplies);
			}
		});
	}

	function loadAndRenderPresentUsers(context) {
		$.telligent.evolution.get({
			url: $.telligent.evolution.site.getBaseUrl() + 'api.ashx/v2/presencesummary/content.json',
			data: $.extend({
				ContentId: context.contentId,
				ContentTypeId: context.contentTypeId
			}, context.commentTypeId.length > 0 ? { TypeId: context.commentTypeId } : {})
		}).then(function(r){
			if(r && r.presencesummary && r.presencesummary.PresentUsers) {
				context.presentUsers = r.presencesummary.PresentUsers;
				renderStatistics(context);
			}
		});
	}

	$.telligent.evolution.widgets.comments = {
		register: function(context) {
			renderStatistics(context);
			handleEvents(context);

			initCreateRootReplyForm(context);

			setTimeout(function(){
				loadAndRenderPresentUsers(context);
			}, 100);

			// prevent notifications about the content
			$.telligent.evolution.notifications.addFilter(function(notification){
				// ignore notifications about current content
				return notification.contentId != context.contentId;
			});

			var editor;

			// init evolution threaded replies against the comments API
			$(context.wrapper).evolutionThreadedReplies({
				replyId: context.commentId,
				preFocus: context.preFocus,
				sortBy: context.sortBy,
				headerContent: $.telligent.evolution.template(context.headerTemplate)({}),
				sortOrder: context.sortOrder,
				flattenedSortBy: context.flattenedSortBy,
				flattenedSortOrder: context.flattenedSortOrder,
				replyOffsetId: context.replyOffsetId,
				replyOffsetDirection: context.replyOffsetDirection,
				threadUrl: context.contentUrl,
				onParseReplyId: function() {
					var parsedQuery = $.telligent.evolution.url.parseQuery(global.location.href);
					return parsedQuery['CommentId'];
				},
				onGenerateReplyUrl: function(id) {
					return $.telligent.evolution.url.modify({
						url: global.location.href,
						query: {
							CommentId: id
						}
					});
				},
				replySortByQueryStringKey: 'CommentSortBy',
				replySortOrderQueryStringKey: 'CommentSortOrder',
				defaultReplyIdQueryStringValue: null,
				defaultReplySortByQueryStringValue: 'CreatedDate',
				defaultReplySortOrderQueryStringValue: 'Ascending',
				pageSize: context.pageSize,
				flattenedDepth: context.flattenedDepth,
				loadOnScroll: context.endlessScroll,
				wrapper: context.wrapper,
				container: context.container,
				text: context.text,
				includeFirstPageOnPermalinks: true,
				baseLoadIndicatorsOnSiblings: true,
				highlightNewReplySeconds: context.highlightNewSeconds,
				noRepliesMessage: context.noRepliesMessage,

				/*
				options:
					parentId // if by parent id, assumes to also get total reply count of parent
					replyId // if by reply id, assumes to also get reply and permalink context
					flattenedDepth
					sortBy
					sortOrder
					startReplyId
					endReplyId
				returns:
					nested list of replies
						potentialy including the reply's parents
						and the individual reply if specific
						and any of the reply's children
				*/
				onListReplies: function(options) {
					var request = $.extend({
							contentId: context.contentId,
							contentTypeId: context.contentTypeId,
							parentId: options.parentId || null,
							commentId: options.replyId || null,
							includeSiblings: options.includeSiblings || false,
							flattenedDepth: (options.flattenedDepth === undef ? context.flattenedDepth : options.flattenedDepth),
							sortBy: options.sortBy || context.sortBy,
							sortOrder: options.sortOrder || context.sortOrder,
							flattenedSortBy: options.flattenedSortBy || context.flattenedSortBy,
							flattenedSortOrder: options.flattenedSortOrder || context.flattenedSortOrder,
							startReplyId: options.startReplyId || null,
							endReplyId: options.endReplyId || null,
							initial: options.initial || false
						}, context.commentTypeId.length > 0 ? { commentTypeId: context.commentTypeId } : {});
					return $.telligent.evolution.get({
						url: context.listRepliesUrl,
						data: prefix(request)
					});
				},
				/*
				options:
					replyId
					pageIndex
				*/
				onListVoters: function(options) {
					return $.telligent.evolution.get({
						url: $.telligent.evolution.site.getBaseUrl() + 'api.ashx/v2/comments/votes.json',
						data: {
							CommentId: options.replyId,
							PageIndex: options.pageIndex
						},
						cache: false
					}).then(function(r){
						var users = $.map(r.CommentVotes, function(v){
							return v.User
						});
						r.Users = users;
						return r;
					});
				},
				/*
				options:
					body
					parentId
				returns:
					promised reply
				*/
				onAddReply: function(options) {
					return $.telligent.evolution.post({
						url: context.addReplyUrl,
						data: prefix($.extend({
							contentId: context.contentId,
							contentTypeId: context.contentTypeId,
							parentId: options.parentId || null,
							body: options.body || null
						}, context.commentTypeId.length > 0 ? { commentTypeId: context.commentTypeId } : {}))
					}) 
					.done(function() {
                        context.replyEditor.val('');
                    });
				},
				/*
				options:
					body
					replyId
				returns
					promised reply
				*/
				onEditReply: function(options) {
					return $.telligent.evolution.post({
						url: context.editReplyUrl,
						data: prefix({
							commentId: options.replyId || null,
							body: options.body || null
						})
					}) 
					.done(function() {
                        context.replyEditor.val('');
                    });
				},
				/*
				options:
					replyId
				returns:
					promised reply
				*/
				onGetReply: function(options) {
					return $.telligent.evolution.get({
						url: context.getReplyUrl,
						data: prefix({
							commentId: options.replyId
						})
					})
				},
				/*
				options:
					replyId
				*/
				onDeletePrompt: function(options) {
					var deleteCommentPanelUrl = context.deleteCommentPanelUrl.replace(context.emptyGuid, options.replyId);
					global.location.href = deleteCommentPanelUrl;
				},
				/*
				options:
					replyId
					value: true|false|null // up/down/delete
				Returns:
					reply
				*/
				onVoteReply: function(options) {
					// vote up
					if(options.value === true) {
						return $.telligent.evolution.post({
							url: jQuery.telligent.evolution.site.getBaseUrl() + 'api.ashx/v2/comments/vote.json',
							data: {
								CommentId: options.replyId,
								Value: true
							}}).then(function(response){
								loadAndRenderBestReplies(context);
								return {
									replyId: options.replyId,
									yesVotes: response.CommentVote.Comment.YesVotes,
									noVotes: response.CommentVote.Comment.NoVotes,
									value: true
								};
							});
					// vote down
					} else if(options.value === false) {
						return $.telligent.evolution.post({
							url: jQuery.telligent.evolution.site.getBaseUrl() + 'api.ashx/v2/comments/vote.json',
							data: {
								CommentId: options.replyId,
								Value: false
							}}).then(function(response){
								loadAndRenderBestReplies(context);
								return {
									replyId: options.replyId,
									yesVotes: response.CommentVote.Comment.YesVotes,
									noVotes: response.CommentVote.Comment.NoVotes,
									value: false
								};
							});
					// delete vote
					} else {
						return $.telligent.evolution.del({
							url: jQuery.telligent.evolution.site.getBaseUrl() + 'api.ashx/v2/comments/vote.json',
							data: {
								CommentId: options.replyId
							}}).then(function(response){
								loadAndRenderBestReplies(context);
								return {
									replyId: options.replyId,
									value: null
								};
							});
					}
				},

				onTyping: function(options) {
					$.telligent.evolution.sockets.comments.send('typing', $.extend({
						contentId: context.contentId,
						parentCommentId: options.parentId
					}, context.commentTypeId.length > 0 ? { commentTypeId : context.commentTypeId } : {}));
				},

				// raise callbacks on model
				onInit: function(controller) {
					$.telligent.evolution.messaging.subscribe('comment.updated', function(data){
						if(context.contentId == data.contentId && data.approved && (!data.commentTypeId || data.commentTypeId == context.commentTypeId)) {
							controller.raiseReplyUpdated({
								contentId: data.contentId,
								contentTypeId: data.contentTypeId,
								replyId: data.commentId,
								authorId: data.authorId
							})
						}
					});
					$.telligent.evolution.messaging.subscribe('comment.created.root', function(data){
						if(context.contentId == data.contentId && data.approved && (!data.commentTypeId || data.commentTypeId == context.commentTypeId)) {
							controller.raiseReplyCreated({
								replyId: data.commentId,
								forceRender: true
							})
						}
					});
					$.telligent.evolution.messaging.subscribe('comment.created', function(data){
						if(context.contentId == data.contentId && data.approved && (!data.commentTypeId || data.commentTypeId == context.commentTypeId)) {
							controller.raiseReplyCreated({
								parentId: data.parentId,
								replyId: data.commentId,
								total: data.total,
								authorId: data.authorId
							})
						}
					});
					$.telligent.evolution.messaging.subscribe('comment.typing', function(data){
						if(context.contentId == data.contentId && (!data.commentTypeId || data.commentTypeId == context.commentTypeId)) {
							controller.raiseTypingStart(data)
						}
					});
					$.telligent.evolution.messaging.subscribe('comment.voted', function(data){
						if(context.contentId == data.contentId && (!data.commentTypeId || data.commentTypeId == context.commentTypeId)) {
							controller.raiseVote({
								replyId: data.commentId,
								yesVotes: data.yesVotes,
								noVotes: data.noVotes
							});
						}
					});
					$.telligent.evolution.messaging.subscribe('comment.deleted', function(data){
						controller.raiseReplyDeleted({
							replyId: data.commentId,
							deleteChildren: data.replyCount === 0
						});
					});
					$.telligent.evolution.messaging.subscribe('ui.comment.delete', function(data){
						controller.attemptDelete({
							replyId: data.commentId,
							deleteChildren: data.deleteChildren
						});
					});
					$.telligent.evolution.messaging.subscribe('widgets.threadedComments.typing', function(data){
						controller.attemptTyping({
							parentId: data.container.closest('.content-item').data('id'),
							commentTypeId: context.commentTypeId
						})
					});
					$.telligent.evolution.messaging.subscribe('widgets.threadedComments.submit', function(){
						var replyForm = context.currentEditorParentContainer.closest('.reply-form');
						// editing existing reply
						if(replyForm.length > 0 && replyForm.data('editing')) {
							controller.attemptUpdate({
								body: context.replyEditor.val(),
								replyId: replyForm.data('editing')
							})
						// adding new reply
						} else {
							controller.attemptCreate({
								parentId: context.currentEditorParentContainer.closest('.content-item').data('id'),
								body: context.replyEditor.val()
							});
						}
					});
				},

				// adjust the filter UI as per current request
				onFilterChange: function(options) {
					$(context.filterWrapper).find('li').removeClass('selected').each(function(){
						var li = $(this);
						if(li.data('sortby') == options.sortBy && li.data('sortorder') == options.sortOrder) {
							li.addClass('selected');
						}
					});
				},

				/*
				container
				*/
				onEditorAppendTo: function(options) {
					context.currentEditorParentContainer = options.container;
					context.replyEditor.appendTo(options.container);
				},
				onEditorRemove: function(options) {
					context.currentEditorParentContainer = null;
					context.replyEditor.remove();
				},
				onEditorVal: function(options) {
					context.replyEditor.val(options.val);
				},
				onEditorFocus: function(options) {
					context.replyEditor.focus();
				},

				// templates
				loadMoreTemplate: context.loadMoreTemplate,
				newRepliesTemplate: context.newRepliesTemplate,
				replyTemplate: context.replyTemplate,
				typingIndicatorTemplate: context.typingIndicatorTemplate,
				replyListTemplate: context.replyListTemplate,
				replyFormTemplate: context.replyFormTemplate
			});
		}


	};

})(jQuery, window);