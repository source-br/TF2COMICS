/* 
   	comicViewer plugin for jQuery.

	Requires:
		- jquery.min.js
		- jquery-utils-0.8.5/jquery.utils.lite.min.js
		- jquery.ba-bbq.min.js
		- jquery.imagesloaded.min.js
		- spin.min.js
		- comicviewer.css

	Required options are:
		- base_url: The base URL where the images can be found
		- last_frame: an integer representing the last frame number

	Optional options are:
		- first_frame: an integer representing the first frame - usually 1
		- fnFormat: A format function - the default pads with zeroes, so frame 1 will become '001' etc.
		- extension: The file extension - default is '.jpg'
		- num_preload_images: The number of images to preload - on frame N, frames N+1, N+2, ... N+num_preload_images will be loaded.
		- hash_state_frame_name: This will appear in the URL after '#' for each new frame - default is 'f' - so frame N is will appear as 'http://someurl.com/mycomic/#f=N'
		- enable_ga: Enable Google Analytics per-frame tracking?
		- ga_page_base: A string representing the base relative path to be sent up to Google Analytics - e.g. '/mycomic/#' - hash_state_frame_name and the current frame number will be appended automatically
		- error_sound_url: The URL for the error sound
		- last_frame_link: URL to link to from last comic frame
		- debugging_enabled: Set to 1 to enable spew

	Create a div and call $( '#yourdivname' ).comicViewer( YourSettings ).
*/

(
	function( $ )
	{
		$.fn.comicViewer = function( Options )
		{
			var m_iCurFrame = -1;
			var m_bTransitioning = false;
			var m_bFirstLoad = true;
			var m_nHashChangeIgnoreTime = 0;

			// Create some defaults, extending them with any options that were provided
			var Settings = $.extend(
				{
					// força buscar imagens na pasta local "Traduzido/"
					'base_url'		: 'Traduzido/',
					'first_frame'		: 1,
					'hash_state_frame_name'	: 'f',
					'num_preload_images'	: 3,
					'fnFormat'		: PadWithZeroes,
					'extension'		: '.png?v=3',
					'enable_ga'		: false,
					'error_sound_url'	: null,
					'last_frame_link'	: null,
					'on_frame_set_callback' : null,
					'debugging_enabled'	: 0
				},
				Options
			);

			var $Comic = this;

			// Add some support elements
			$Comic.append( "<div id='cvOverlay'></div>" );
			$Comic.append( "<div id='cvErrorOverlay'></div>" );
			$Comic.append( "<img class='cvImg' />" );
			$( 'body' ).append( "<div id='cvLoader'></div>" );

			var $ComicImg = this.find( 'img' );

			// Store settings for later
			$Comic.data( 'comicViewer', Settings );

			// Add a sound object
			AddSoundObject();
		
			//
			// Private methods
			//
			function GetTime()
			{
				return new Date().getTime();
			}

			function BRedirectIfLastFrameLinkSet( iFrame )
			{
				if ( iFrame < Settings.last_frame )
					return false;

				// Redirect to last-frame link?
				if ( Settings.last_frame_link == null )
					return false;

				window.location.href = Settings.last_frame_link;
				return true;
			}

			function UpdateBrowserURL( nNewFrame )
			{
				m_nHashChangeIgnoreTime = GetTime() + 100;

				var state = {};
				state[ Settings.hash_state_frame_name ] = nNewFrame;
				$.bbq.removeState( state );
				$.bbq.pushState( state, 0 );
			}

			function PadWithZeroes( str )
			{
				while ( str.length < 3 ) str = '0' + str;
				return str;
			}

			function GetURLForImage( iFrame )
			{
				var strFrame = new String( iFrame );
				// Use sempre a pasta local "Traduzido/" — se alguém passou uma URL com http(s), ignora-a
				var base = Settings.base_url || 'Traduzido/';
				if ( typeof base === 'string' && ( base.indexOf( 'http://' ) === 0 || base.indexOf( 'https://' ) === 0 ) )
				{
					base = 'Traduzido/';
				}
				// garante barra final
				if ( base.charAt( base.length - 1 ) !== '/' ) base += '/';
				return base + Settings.fnFormat( strFrame ) + Settings.extension;
			}

			function PreloadImage( iFrame )
			{
				if ( BIsImageLoadingOrDownloaded( iFrame ) )
					return;

				var strImageURL = GetURLForImage( iFrame );
				if ( Settings.debugging_enabled )
				{
					console.log( strImageURL );
				}
				$( '#cvLoader' ).append( "<img id='cv" + iFrame + "' src='" + strImageURL + "'/>" );
			}

			function PreloadSubsequentImages()
			{
				if ( m_iCurFrame >= Settings.last_frame )
					return;

				// Preload the next N images
				var iLastFrameToPreload = Math.min( Settings.last_frame, m_iCurFrame + Settings.num_preload_images );
				for ( var iFrame = m_iCurFrame + 1; iFrame <= iLastFrameToPreload; iFrame++ )
				{
					PreloadImage( iFrame );
				}
			}

			function BIsImageLoadingOrDownloaded( iFrame )
			{
				var $Elem = $( '#cv' + iFrame );
				return $Elem.length > 0 && $Elem.data( 'loaded' );
			}

			function SetFrame( iFrame, bFade )
			{
				// If already in the midst of transitioning to a new frame, get out
				if ( m_bTransitioning )
					return;

				// Tell GA about it
				if ( Settings.enable_ga )
				{
					_gaq.push(['_trackPageview', Settings.ga_page_base + Settings.hash_state_frame_name + '=' + iFrame]);
				}

				m_bTransitioning = true;

				// Clamp
				iFrame = Math.max( Settings.first_frame, Math.min( Settings.last_frame, iFrame ) );
				
				// Get the image URL
				var strURL = GetURLForImage( iFrame );

				// If there is no preloaded image for the given frame, assume it isn't loaded and display a spinner
				if ( !BIsImageLoadingOrDownloaded( iFrame ) )
				{
					ShowSpinner( true );

					// Make sure the next image is loaded
					PreloadImage( iFrame );
				}


				// Wait for the image to load, if it isn't already
				$( '#cv' + iFrame ).imagesLoaded(
					function( images, proper, broken )
					{
						// Mark the element as loaded
						var $Elem = $( '#cv' + iFrame );
						$Elem.data( 'loaded', 1 );

						// Hide the spinner
						ShowSpinner( false );

						// Show the new image
						$ComicImg.attr( 'src', strURL );

						// Fade it in?
						if ( bFade )
						{
							$Comic.fadeIn( 'slow' );
						}

						// Cache off to global
						m_iCurFrame = iFrame;

						// Preload the next few images
						PreloadSubsequentImages();

						// OK to transition again
						m_bTransitioning = false;
						
						// Let the client code know if a callback was passed in
						if ( Settings.on_frame_set_callback )
						{
							Settings.on_frame_set_callback( iFrame );
						}
					}
				);

			}

			$( "#Comic" ).mouseover(function(){
				$( '#FullScreenComic' ).show();
			});

			$( "#Comic" ).mouseout(function(){
				$( '#FullScreenComic' ).hide();
			});

			$(document).ready(function()
			{
				$('#FullScreenComic').on('click', function(e)
				{
					var elem = $('#Comic')[0];
					if (document.webkitFullscreenElement)
					{
						document.webkitCancelFullScreen();
					}
					else if( document.mozFullScreen )
					{
						document.mozCancelFullScreen();
					}
					else
					{
						if( elem.requestFullscreen )
						{
							elem.requestFullscreen();
						}
						else if( elem.webkitRequestFullScreen )
						{
							elem.webkitRequestFullScreen();
						}
						else if( elem.mozRequestFullScreen )
						{
							elem.mozRequestFullScreen();
						}
						else if( elem.msRequestFullscreen )
						{
							elem.msRequestFullscreen();
						}
					};
				});
			});

			function SetImagePositionFullscreen( bIsFullScreen )
			{
				if( !bIsFullScreen )
				{
					$( '#Comic' ).css( 'height', "" );
					$( '#Comic' ).css( 'width', "" );
					$( '.cvImg' ).css( 'left', "" );
					$( '.cvImg' ).css( 'top', "" );
					$( '.cvImg' ).css( 'height', "" );
					$( '.cvImg' ).css( 'width', "" );
				}
				else
				{
					$( '#Comic' ).css( 'height', "100%" );
					$( '#Comic' ).css( 'width', "100%" );
					var unScreenWidth = window.screen.availWidth;
					var unScreenHeight = window.screen.availHeight;
					if( unScreenWidth * 0.75 > unScreenHeight )
					{
						$( '.cvImg' ).css( 'height', "100%" );
						$( '.cvImg' ).css( 'max-width', (unScreenHeight / 0.75) );
						$( '.cvImg' ).css( 'left', (unScreenWidth - (unScreenHeight / 0.75)) / 2 );
					}
					else
					{
						$( '.cvImg' ).css( 'width', "100%" );
						$( '.cvImg' ).css( 'height', (unScreenWidth * 0.75) );
						$( '.cvImg' ).css( 'top', (unScreenHeight - (unScreenWidth * 0.75)) / 2 );
					}
				}
			}

			document.addEventListener("mozfullscreenchange", function() {
				SetImagePositionFullscreen( document.mozFullScreen );
			});

			document.addEventListener("webkitfullscreenchange", function() {
				SetImagePositionFullscreen( document.webkitFullscreenElement );
			});

			function ShowSpinner( bShow )
			{
				var $Overlay = $( '#cvOverlay' );

				if ( bShow )
				{
					var opts = {
						lines: 11, // The number of lines to draw
						length: 7, // The length of each line
						width: 5, // The line thickness
						radius: 16, // The radius of the inner circle
						rotate: 0, // The rotation offset
						color: '#fff', // #rgb or #rrggbb
						speed: 1.5, // Rounds per second
						trail: 61, // Afterglow percentage
						shadow: false, // Whether to render a shadow
						hwaccel: false, // Whether to use hardware acceleration
						className: 'spinner', // The CSS class to assign to the spinner
						zIndex: 2e9, // The z-index (defaults to 2000000000)
						top: 'auto', // Top position relative to parent in px
						left: 'auto' // Left position relative to parent in px
					};

					$Overlay.stop().animate(
						{ opacity: 0.8 },
						'fast',
						'swing',
						function()
						{
							$Overlay.spin( opts );
						}
					);
				}
				else 
				{
					$Overlay.stop();
					$Overlay.css( 'opacity', '0' );
					$Overlay.empty();
				}
			}

			function AddSoundObject()
			{
				var $Sound = $( '#error_sound' );
				$Sound.remove();
				$Comic.append( "<audio preload='auto' id='error_sound' style='display: none' src='" + Settings.error_sound_url + "'></audio>" );
			}

			var nLastErrorPlayTime = 0;
			var nErrorDuration = 200;

			function PlayErrorSound()
			{
				AddSoundObject();
				var Sound = document.getElementById( 'error_sound' );
				Sound.play();
			}

			function PlayErrorAnim()
			{
				var $ErrorOverlay = $( '#cvErrorOverlay' );
				var nAnimDuration = 70;
				$ErrorOverlay.stop().fadeIn(
					nAnimDuration,
					function()
					{
						$ErrorOverlay.fadeOut( nAnimDuration );
					}
				);
			}

			function PlayError()
			{
				if ( GetTime() < nLastErrorPlayTime + nErrorDuration )
					return;

				PlayErrorSound();
				PlayErrorAnim();

				nLastErrorPlayTime = GetTime();
			}

			function BindHashChangeEvent( bBind )
			{
				if ( bBind )
				{
					$( window ).bind(
						'hashchange',
						function()
						{
							// Ignore hash change events if forced to do so
							if ( GetTime() <= m_nHashChangeIgnoreTime )
								return;

							var iFrame = parseInt( $.bbq.getState( Settings.hash_state_frame_name ) );
							if ( isNaN( iFrame ) )
							{
								iFrame = Settings.first_frame;
							}

							SetFrame( iFrame, m_bFirstLoad );
							m_bFirstLoad = false;
						}
					);
				}
				else
				{
					$( window ).unbind( 'hashchange' );
				}
			}

			$( document ).keydown(
				function( e )
				{
					var iNewFrame = m_iCurFrame;
					var bKeyHandled = false;
					var bPlayErrorAnim = false;
					var bRedirecting = false;

					switch ( e.keyCode )
					{
					case $.keyCode.LEFT:
						bKeyHandled = true;
						bPlayErrorAnim = m_iCurFrame <= Settings.first_frame;
						iNewFrame = Math.max( Settings.first_frame, m_iCurFrame - 1 );
						break; 

					case $.keyCode.SPACE:
					case $.keyCode.RIGHT:
						bKeyHandled = true;

						bRedirecting = BRedirectIfLastFrameLinkSet( m_iCurFrame );
						if ( !bRedirecting )
						{
							bPlayErrorAnim = m_iCurFrame >= Settings.last_frame;
							iNewFrame = Math.min( Settings.last_frame,  m_iCurFrame + 1 );
						}

						break;
					}

					// Set the new frame 
					if ( !bRedirecting && iNewFrame != m_iCurFrame )
					{
						SetFrame( iNewFrame );
						UpdateBrowserURL( iNewFrame );
					}

					if ( bKeyHandled )
					{
						e.preventDefault();
						e.stopPropagation();
					}

					if ( bPlayErrorAnim )
					{
						PlayError();
					}
				}
			);

			// Handle clicks
			$Comic.on(
				'click',
				function( e )
				{
					if( e.target.id == "FullScreenComic")
						return;

					// Already on last frame?
					if ( m_iCurFrame >= Settings.last_frame )
					{
						if ( BRedirectIfLastFrameLinkSet( m_iCurFrame ) )
							return;

						PlayError();
						return;
					}

					// Advance frame
					var nNewFrame = m_iCurFrame + 1;
					SetFrame( nNewFrame );
					
					// Push the state/modify the URL in the browser
					UpdateBrowserURL( nNewFrame );
				}
			);

			// Bind and trigger initialize hash change event
			BindHashChangeEvent( true );
			$( window ).trigger( 'hashchange' );
		};
	}
)( jQuery );


