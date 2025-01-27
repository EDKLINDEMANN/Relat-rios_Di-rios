window.dugout_videos = window.dugout_videos || [];
window.dugout_producers_config = window.dugout_producers_config || [];

if (typeof window.dugout_style === "undefined") {
    var css = '.dugout-video{background:black;}.dugout-no-float{position:absolute;top:0;bottom:0;width:100%;height:100%;overflow:hidden;}.dugout-float{position:fixed;z-index:9999;overflow:hidden;width:100%;height:230px;max-width:410px;max-height:230px;}.dugout-float-top-right{top:10;right:10;}.dugout-float-bottom-right{bottom:10;right:10;}.dugout-float-bottom-left{bottom:10;left:10;}.dugout-float-top-left{top:10;left:10;}.dugout-float .dgtclsbtn{width:30px;height:30px;position:absolute;top:0;right:0;margin:5px;}.dgtclsbtn svg{width:inherit;height:inherit}.dugout-no-float .dgtclsbtn{display:none}';

    window.dugout_style = document.createElement('style');
    var head = document.getElementsByTagName('head');
    head[0].appendChild(window.dugout_style);

    dugout_style.type = 'text/css';
    if (dugout_style.styleSheet) dugout_style.styleSheet.cssText = css;
    else dugout_style.appendChild(document.createTextNode(css));
}

if (typeof window.DugoutEmbed === "undefined") {

    window.DugoutEmbed = {

        debug: false,
        debug_msg: 'Dugout Embed',

        instance: 0,
        jwloop: 0,
        running_as_iframe: false,
        iframe_url: "https://embed.dugout.com/v2/",
        rootDomain: '',
        mode: null,
        is_mobile: false,
        amp: false,
        show_ads: true,
        start_mode: null,
        mute_mode: null,

        partner_id: null,
        floating_player: false,

        use_cookies: false,
        ga: true,
        ga_event_tracking: false,

        query_string: false,

        prebid: false,
        prebid_lib: "//embed.dugout.com/libs/prebid3.9.0-vz.js",
        prebid_wait: true,

        cmpFrame: null,
        cmpCallbacks: {},

        cmp_detected: false,
        gdpr: 0,
        gdpr_consent: null,
        npa: 0,

        cmp: function(cmd, arg, callback) {
            if(!this.cmpFrame) {
                callback({msg:"CMP not found"}, false);
                return;
            }

            var callId = Math.random() + "";
            var msg = {__cmpCall: {
                command: cmd,
                parameter: arg,
                callId: callId
            }};

            this.cmpCallbacks[callId] = callback;
            this.cmpFrame.postMessage(msg, '*');
        },

        checkCMP: function() {

            window.addEventListener("message", (function(event) {
                var json=null;

                if (typeof event.data === "string") {
                    try {
                        json =  JSON.parse(event.data);
                    }
                    catch(e){}
                }
                else json = event.data;

                if (json && json.__cmpReturn) {
                    var i = json.__cmpReturn;
                    if (typeof this.cmpCallbacks[i.callId] === 'function') this.cmpCallbacks[i.callId](i.returnValue, i.success);
                    delete this.cmpCallbacks[i.callId];
                }
                if (json && json.__dugoutReturn) {
                    if (json.__dugoutReturn.command=='sendGooglePersonalization') {
                        this.npa = json.__dugoutReturn.consent;
                        console.log("Dugout: Google npa=" + this.npa);
                    }
                }
                if (json && json.__dugoutCall) {
                    if (json.__dugoutCall.command=='getGooglePersonalization') {
                        if (typeof window.__cmp === 'function') {
                            window.__cmp( 'getGooglePersonalization', function(consent, isSuccess) {
                                event.source.postMessage({
                                    "__dugoutReturn": {
                                        "command": "sendGooglePersonalization",
                                        "consent": (consent.googlePersonalizationData.consentValue) ? 0:1
                                    }
                                }, "*");
                            });
                        }
                        else {
                            event.source.postMessage({"__dugoutReturn":{"command":"sendGooglePersonalization","consent":1}});
                        }
                    }
                }
            }).bind(this), false);

            if (window!==window.top) {
                console.log('Dugout: Checking CMP...');

                var f=window;
                var loop = 0;
                while(!this.cmpFrame) {
                    try {
                        if(f.frames["__cmpLocator"]) this.cmpFrame = f;
                    } catch(e) {}
        
                    if(f === window.top) break;
                    f = window.parent;
                    loop++;
                    console.log('Dugout CMP Loop ', loop);
                    if (loop>5) break;
                }

                if (this.cmpFrame) {
                    console.log('Dugout: CMP found!');
                    this.cmp_detected = true;
                    this.npa=1; 

                    this.cmp("getConsentData", 1, (function(val, success) {
                        this.gdpr = (val.gdprApplies) ? 1 : 0;
                        if (!this.gdpr_consent) this.gdpr_consent = val.consentData;
                    }).bind(this));
                }
                else {
                    console.log('Dugout: CMP not found');
                }

                window.parent.postMessage({
                    "__dugoutCall": {
                        "command": "getGooglePersonalization"
                    }
                }, "*");
            }

            this.init();
        },

        init: function() {

            this.instance++;

            if (!this.debug && typeof window.dugout_partner_config !== 'undefined' && typeof window.dugout_partner_config.debug_script !== 'undefined') {
                this.debug = (window.dugout_partner_config.debug_script == 'yes') ? true : false;
            }

            if (this.instance == 1) {
                // Only the first time we run init()
                if (typeof window.dugout_iframe !== 'undefined' && window.dugout_iframe == true) {
                    this.running_as_iframe = true;
                    this.debug_msg = "Dugout iFrame";
                }

                if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
                    this.is_mobile = true;
                }

                // Track in Google Analytics
                this.gaSetup();
                this.gaTrack([{
                    type: 'pageview'
                }]);

                // check URL parameters
                this.checkURLParameters();

                this.log('v3.1 start');

                // get the root domain
                if (window.location != window.parent.location) this.rootDomain = this.extractRootDomain(document.referrer);
                else this.rootDomain = this.extractRootDomain(document.location.href);
                this.log('Root domain: ', this.rootDomain);
            }

            // look for embeds in the page
            var previous_embeds = window.dugout_videos.length;
            this.checkScript();
            this.checkDivs();
            if (window.dugout_videos.length == 0) {
                this.log('No embed codes found');
                return false;
            } else if (window.dugout_videos.length == previous_embeds) {
                this.log('No new embeds to process');
                return false;
            } else {
                this.log(window.dugout_videos.length, ' embed codes found');
                this.log('Embed codes: ', window.dugout_videos);
            }

            // check for partner configuration
            if (typeof window.dugout_partner_config === "undefined") {
                this.log('No partner configuration found. Loading configuration...');
                this.loadPartnerConfig();
            } else this.init2();

        },

        loadPartnerConfig: function() {
            var hash = JSON.parse(atob(window.dugout_videos[0].hash));

            if (hash && "p" in hash) {
                var http = new XMLHttpRequest();
                var pid = hash["p"].replace('.', '-');
                //console.log('Changed pid: ', pid);
                http.open('GET', "https://embed.dugout.com/data/partners/" + pid + ".json", true);
                http.onload = (function(e) {
                    window.dugout_partner_config = JSON.parse(http.responseText);
                    if (!this.debug && typeof window.dugout_partner_config !== 'undefined' && typeof window.dugout_partner_config.debug_script !== 'undefined') {
                        this.debug = (window.dugout_partner_config.debug_script == 'yes') ? true : false;
                    }
                    this.log('Partner configuration loaded for ' + hash["p"] + ': ', window.dugout_partner_config);
                    this.init2();
                }).bind(this);
                http.send();
            } else this.log('No partner_id found');
        },

        init2: function() {

            this.log('Partner ID:', window.dugout_partner_config.owner_nickname);

            // prebid
            if (this.running_as_iframe) {
                //this.prebid = (typeof window.dugout_partner_config.allow_prebid_ads && window.dugout_partner_config.allow_prebid_ads == 'yes') ? true : false;
                //if (this.prebid) this.setupPrebid();
            }

            // load JWPlayer
            if (typeof window.jwplayer === 'undefined' && this.running_as_iframe) {
                this.log('JWPlayer not loaded, loading now...');
                var player_id =
                    (window.dugout_videos[0].mode == "EP") ?
                    window.dugout_partner_config.player_id :
                    (typeof window.dugout_partner_config.player_id_aop !== 'undefined' && window.dugout_partner_config.player_id_aop.length) ?
                    window.dugout_partner_config.player_id_aop : window.dugout_partner_config.player_id;

                var script = document.createElement('script');
                script.onload = (this.checkForJW).bind(this);
                script.src = "https://cdn.jwplayer.com/libraries/" + player_id + ".js";
                document.head.appendChild(script);
            } else {
                if (false && window.dugout_partner_config.embed_type == 'inline') {
                    this.log('JWPlayer not loaded but required');
                    this.checkForJW();
                } else {
                    this.log('JWPlayer not needed');
                    this.createVideoPlayers();
                }
            }

        },

        checkScript: function() {
            var currentScript = document.currentScript || function() { for (var a = document.querySelectorAll("script[src]"), b = 0; b < a.length; b++) { var c = a[b]; if (-1 !== c.src.indexOf('dugout.com') && !c.getAttribute("data-loaded")) return c } return null }();
            var hash = currentScript.getAttribute('data-dugout-video');
            if (!hash) {
                // check for URL parameters
                if ("p" in this.query_string) hash = this.query_string["p"];
            }
            var start_mode = currentScript.getAttribute('data-video-start');
            if (start_mode && ['playinview','clicktoplay'].indexOf(start_mode)>-1) this.start_mode = start_mode;
            var mute_mode = currentScript.getAttribute('data-video-mute');
            if (mute_mode && ['true','false'].indexOf(mute_mode)>-1) this.mute_mode = mute_mode;

            if (hash && hash.length) {
                var html_tag = '<div class="dugout-video dugout-embed-' + hash + '"></div>';
                var replace = currentScript.getAttribute('data-replace');
                if (replace && replace.length) {
                    var op = replace.substr(0,2);
                    var sel = replace.substr(2);
                    if (op==">>") document.querySelector(sel).insertAdjacentHTML('afterend', html_tag);
                    else if (op=="=>") document.querySelector(sel).insertAdjacentHTML('beforeend', html_tag);
                    else if (op=="<<") document.querySelector(sel).insertAdjacentHTML('beforebegin', html_tag);
                    else if (op=="<=") document.querySelector(sel).insertAdjacentHTML('afterbegin', html_tag);
                    else if (op=="!!") document.querySelector(sel).outerHTML = html_tag;
                    else if (op=="==") document.querySelector(sel).innerHTML = html_tag;
                    else document.querySelector(replace).innerHTML = html_tag;
                } 
                else currentScript.insertAdjacentHTML('afterend', html_tag);
            }

        },

        checkDivs: function() {
            var videos = document.querySelectorAll('div.dugout-video'); // select not initialized video tags
            for (var v = 0; v < videos.length; v++) {
                var hash = null;

                for (var i = 0; i < videos[v].classList.length; i++) {
                    if (videos[v].classList.item(i).indexOf('dugout-embed-') === 0) {
                        hash = videos[v].classList.item(i).substring(("dugout-embed-").length);
                    }
                }

                if (hash && hash.length) {
                    var hash_obj = JSON.parse(atob(hash));
                    var new_player = null;
                    if ("p" in hash_obj && hash_obj.p.length) {
                        if (!this.partner_id) this.partner_id = hash_obj.p;
                        if (hash_obj.p == this.partner_id) {
                            videos[v].setAttribute('id', 'placeholder_' + hash);
                            videos[v].setAttribute('style', 'position:relative;overflow:hidden;padding:56.25% 0 0 0;height:0;');
                            new_player = new DugoutPlayer(window.dugout_videos.length, hash);
                            window.dugout_videos.push(new_player);
                        } else {
                            this.log("Trying to embed a second publisher player", hash_obj);
                        }
                    }
                    if (new_player) {
                        for (var a = 0; a < videos[v].attributes.length; a++) {
                            if (videos[v].attributes[a].name.indexOf('data-')==0) window.dugout_videos[v].attributes[ videos[v].attributes[a].name.substr(5) ]=videos[v].attributes[a].value;
                        }
                    } 

                    videos[v].removeAttribute('class');
                }
            }
        },

        checkForJW: function() {
            this.log('Is JWPlayer available? ', (typeof window.jwplayer === 'undefined') ? 'no' : 'yes', this.jwloop);

            if (this.jwloop > 25) {
                this.log('Could not load JWPlayer. Aborting.');
                return;
            }

            if (typeof jwplayer === 'undefined') {
                this.jwloop++;
                setTimeout((this.checkForJW).bind(this), 100); // wait to jwplayer to be available
                return;
            }

            this.createVideoPlayers();
        },

        createVideoPlayers: function() {

            this.log('Creating video players...');

            for (var i = 0; i < window.dugout_videos.length; i++) {
                window.dugout_videos[i].run();
            }

        },

        getPlaylistURL: function(playlist_id, related_video) {

            var url = 'https://cdn.jwplayer.com/v2/playlists/';
            var params = [];

            if (playlist_id == 'none') return '';
            
            else if (playlist_id == 'latest') playlist_id='W5FWgUmX';

            else if (playlist_id == 'related-any' || playlist_id == 'related-same') {
                if (related_video) {
                    var tags = [];
                    //params.push('related_media_id=' + related_video.mediaid);
                    if (playlist_id=='related-same') tags.push('cl-'+related_video.owner_nickname);
                    var language_tag = window.DugoutEmbed.getVideoLanguageTag(related_video.language);
                    if (language_tag) tags.push(language_tag);
                    if (tags.length) {
                        params.push('tags=' + tags.join(','));
                        params.push('tags_mode=ALL');
                    }
                    playlist_id = 'W5FWgUmX'; // latest videos filtered by language and maybe club
                } else {
                    playlist_id = 'W5FWgUmX'; // if we don't have a related video, let's return the latest videos
                }
            }

            url += playlist_id;
            if (params.length) url += '?' + params.join('&');

            return url;
        },

        getVideoLanguageTag: function(language) {
            var tags = {
                en: "ln-en-english",
                es: "ln-es-spanish",
                pt: "ln-pt-portuguese",
                ar: "ln-ar-arabic",
                tk: "ln-tk-turkish",
                vi: "ln-vi-vietnamese",
                fr: "ln-fr-french",
                id: "ln-id-indonesian",
                it: "ln-it-italian"
            };
            if (language in tags) return tags[language];

            return false;
        },

        // URL helpers

        extractHostname: function(url) {
            var hostname;
            //find & remove protocol (http, ftp, etc.) and get hostname

            if (url.indexOf("//") > -1) {
                hostname = url.split('/')[2];
            } else {
                hostname = url.split('/')[0];
            }

            //find & remove port number
            hostname = hostname.split(':')[0];
            //find & remove "?"
            hostname = hostname.split('?')[0];

            return hostname;
        },

        // To address those who want the "root domain," use this function:
        extractRootDomain: function(url) {
            var domain = this.extractHostname(url),
                splitArr = domain.split('.'),
                arrLen = splitArr.length;

            //extracting the root domain here
            //if there is a subdomain
            if (arrLen > 2) {
                domain = splitArr[arrLen - 2] + '.' + splitArr[arrLen - 1];
                //check to see if it's using a Country Code Top Level Domain (ccTLD) (i.e. ".me.uk")
                if (splitArr[arrLen - 2].length == 2 && splitArr[arrLen - 1].length == 2) {
                    //this is using a ccTLD
                    domain = splitArr[arrLen - 3] + '.' + domain;
                }
            }
            return domain;
        },

        // this function just parses the URL parameters and returns an array for easier access
        checkURLParameters: function() {
            var query = window.location.search.substring(1);
            var vars = query.split("&");
            var query_string = {};
            for (var i = 0; i < vars.length; i++) {
                var pair = vars[i].split("=");
                var key = decodeURIComponent(pair[0]);
                var value = decodeURIComponent(pair[1]);
                // If first entry with this name
                if (typeof query_string[key] === "undefined") {
                    query_string[key] = decodeURIComponent(value);
                    // If second entry with this name
                } else if (typeof query_string[key] === "string") {
                    var arr = [query_string[key], decodeURIComponent(value)];
                    query_string[key] = arr;
                    // If third or later entry with this name
                } else {
                    query_string[key].push(decodeURIComponent(value));
                }
            }

            this.query_string = query_string;
            this.log('Query string: ', this.query_string);

            if ("show_ads" in this.query_string && this.query_string.show_ads=='no') this.show_ads = false;
            if ("video_start" in this.query_string && ['playinview','clicktoplay'].indexOf(this.query_string.video_start)>-1) this.start_mode = this.query_string.video_start;
            if ("video_mute" in this.query_string && ['true','false'].indexOf(this.query_string.video_mute)>-1) this.mute_mode = this.query_string.video_mute;
            if ("gdpr_consent" in this.query_string) this.gdpr_consent = this.query_string.gdpr_consent;
            if ("dugout_debug" in this.query_string) this.debug = true;
            if (this.debug) this.log('Debug Mode ON');

            if ("amp" in this.query_string) {
                this.log('AMP in the query string');
                this.amp = true;
                this.loadAMP();
            }
        },

        // Load AMP library
        loadAMP: function() {
            var script = document.createElement('script');
            script.onload = (function() { this.log("AMP library loaded"); }).bind(this);
            script.src = "https://cdn.ampproject.org/video-iframe-integration-v0.js";
            document.head.appendChild(script);
        },

        // Manage cookies
        setCookie: function(cname, cvalue, exdays) {
            var d = new Date();
            d.setTime(d.getTime() + (exdays * 24 * 60 * 60 * 1000));
            var expires = "expires=" + d.toUTCString();
            document.cookie = cname + "=" + cvalue + ";" + expires + "; Samesite=none; Secure";
        },

        getCookie: function(cname) {
            var name = cname + "=";
            var ca = document.cookie.split(';');
            for (var i = 0; i < ca.length; i++) {
                var c = ca[i];
                while (c.charAt(0) == ' ') {
                    c = c.substring(1);
                }
                if (c.indexOf(name) == 0) {
                    return c.substring(name.length, c.length);
                }
            }
            return "";
        },

        // Google Analytics

        gaSetup: function() {
            if (this.ga) {
                // Analytics setup
                if (this.use_cookies) {
                    this.viewer_id = this.getCookie('dugout_uid');
                    if (this.viewer_id == '') {
                        this.viewer_id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                            var r = Math.random() * 16 | 0,
                                v = c == 'x' ? r : (r & 0x3 | 0x8);
                            return v.toString(16);
                        });
                        this.setCookie('dugout_uid', this.viewer_id, 730);
                    }
                } else {
                    this.viewer_id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                        var r = Math.random() * 16 | 0,
                            v = c == 'x' ? r : (r & 0x3 | 0x8);
                        return v.toString(16);
                    });
                }
            }
        },

        gaTrack: function(hits) {
            if (this.ga) {
                var ga_property = "UA-80588940-15"; // -21
                var ga_url = "https://www.google-analytics.com/batch";
                var params = '';

                for (var i = 0; i < hits.length; i++) {
                    params += 'v=1&tid=' + ga_property + '&cid=' + this.viewer_id + '&t=' + hits[i].type;
                    params += '&dl=' + encodeURI(document.location.href);
                    params += '&dt=' + encodeURI(document.title);
                    params += '&vp=' + document.documentElement.clientWidth + 'x' + document.documentElement.clientHeight;

                    if (hits[i].type == 'event') {
                        if ('ec' in hits[i]) params += '&ec=' + encodeURI(hits[i].ec);
                        if ('ea' in hits[i]) params += '&ea=' + encodeURI(hits[i].ea);
                        if ('el' in hits[i]) params += '&el=' + encodeURI(hits[i].el);
                    }
                    params += '\n';
                }
                params += '&z=' + Math.random();

                var http = new XMLHttpRequest();
                http.open('POST', ga_url, true);
                http.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
                http.send(params);
            }
        },

        log: function() {
            if (this.debug) {
                var args = Array.prototype.slice.call(arguments);
                if (typeof this.ordinal !== 'undefined') args.unshift("Player #" + this.ordinal + ": ");
                if (typeof this.instance !== 'undefined') args.unshift("Instance #" + this.instance + ": ");
                args.unshift(this.debug_msg + ": ");
                console.log.apply(console, args);
            }
        },


        // Prebid
        setupPrebid: function() {
            this.log("Setting up prebid...");

            var script = document.createElement('script');
            script.onload = (function() { this.log("Prebid library loaded"); }).bind(this);
            script.src = this.prebid_lib;
            document.head.appendChild(script);

            window.pbjs = window.pbjs || {};
            window.pbjs.que = window.pbjs.que || [];

            window.PREBID_TIMEOUT = 700;

            var inventoryid = (this.cmpFrame) ? 1253348 : 1260301;

            if (window.dugout_partner_config.owner_nickname=='indy') inventoryid=1260458;
            else if (window.dugout_partner_config.owner_nickname=='depersgroep') inventoryid=1260459;

            window.prebid_adunit = {
                code: 'dugout_player',
                mediaTypes: {
                    video: {
                        context: 'instream',
                        playerSize: [
                            [640, 480]
                        ]
                    },
                },
                bids: [{
                    bidder: 'oneVideo',
                    params: {
                        video: {
                            playerWidth: 640,
                            playerHeight: 480,
                            mimes: ['video/mp4', 'application/javascript'],
                            protocols: [2, 5],
                            api: [1,2],
                            delivery: [2],
                            //playbackmethod: [6],
                            placement: 1,
                            inventoryid: inventoryid, // 1253348
                            bidfloor: 0.1
                        },
                        pubId: "Dugout"
                    }
                }]
            };

            const customConfigObject = {
                "buckets": [
                	{
                        "precision": 2,
                        "min": 0.5,
                        "max": 20,
                        "increment": 0.05
                    },
                    {
                        "precision": 2,
                        "max": 30,
                        "increment": 0.50
                    },
                    {
                        "precision": 2,
                        "max": 70,
                        "increment": 1.00
                    },
                    {
                        "precision": 2,
                        "max": 100,
                        "increment": 5.00
                    },
                    {
                        "precision": 2,
                        "max": 200,
                        "increment": 10.00
                    },
                    {
                        "precision": 2,
                        "max": 1000,
                        "increment": 50.00
                    }
                ]
            };

            window.pbjs.que.push(function() {
                window.pbjs.addAdUnits(window.prebid_adunit); // add your ad units to the bid request
                window.pbjs.setConfig({
                    priceGranularity: customConfigObject,
                    consentManagement: {
                        gdpr: {
                            cmpApi: 'iab',
                            timeout: 4000,
                            allowAuctionWithoutConsent: true
                        }
                    },
                    cache: {
                        url: 'https://prebid.adnxs.com/pbc/v1/cache'
                    },
                    debug: window.DugoutEmbed.debug
                });
            });
        }

    };

    // DUGOUT PLAYER OBJECT
    window.DugoutPlayer = function(ordinal, hash) {

        this.debug = window.DugoutEmbed.debug;
        this.debug_msg = window.DugoutEmbed.debug_msg;
        this.log = window.DugoutEmbed.log;

        this.player_defaults = null;

        this.user_muted = -1;
        this.user_volume = -1;

        this.status = 0;
        this.new_video = false;
        this.float = false;
        this.float_position = null;
        this.float_style = null;
        this.visible = false;
        this.jw_viewable = false;
        this.playlist = null;
        this.playlist_pos = 0;
        this.current_video_id = null;

        this.wait_loops = 0;

        this.ordinal = ordinal;
        this.hash = hash;
        this.el = document.getElementById('placeholder_' + hash);
        if (!this.el) {
            this.log('Dugout Player: Element not found: ' + hash);
            return;
        }

        this.pod = 1;

        this.attributes = [];

        // set player config
        this.player_config = JSON.parse(atob(hash));
        this.log('------------- Initialising video player', this.player_config);

        // set the player mode (EP or AOP)
        if ("pl" in this.player_config && this.player_config.pl.length) this.mode = "AOP"; // AOP
        if ("key" in this.player_config && this.player_config.key.length) this.mode = "EP"; // EP

        // EPT
        this.tracking = true;
        this.das_tracking = (typeof DugoutAS !== 'undefined');
        this.das = null;

        // RUN ----------------------------------------------
        this.run = function() {

            if (this.status == 0) {
                this.status = 1; // don't run this function again
                this.debug = window.DugoutEmbed.debug; // update debug value

                this.log('Setup');

                // Run the function immediatelly
                if (window.DugoutEmbed.prebid) this.requestPrebidVideoAd();

                // use the proper default settings
                if (this.mode == "EP") this.player_defaults = (typeof window.dugout_ep_settings !== "undefined") ? window.dugout_ep_settings : window.jwDefaults;
                else if (this.mode == "AOP") this.player_defaults = (typeof window.dugout_aop_settings !== "undefined") ? window.dugout_aop_settings : window.jwDefaults;

                // set the embed type for this particular video (iframe or inline)
                var innerHTML;
                if (window.DugoutEmbed.running_as_iframe) { //|| (window.dugout_partner_config.embed_type == 'inline' && this.mode == "EP")
                    this.log(this.mode + ' running as an inline player inside the iframe');
                    if (window.dugout_partner_config.owner_nickname=='sozcu' && this.player_config.pl=='hkigRJ3i') {
                        this.log('Sozcu with DailyMotion');
                        innerHTML = '<iframe style="min-width: 100%; position: absolute; top: 0; left: 0; height: 100%; overflow: hidden;" frameborder="0" src="https://www.dailymotion.com/embed/video/x7t58mo?autoplay=1" allowfullscreen="" allow="autoplay"></iframe>';
                        this.el.innerHTML = innerHTML;
                    }
                    else {
                        this.embed_type = 'inline';
                        innerHTML = '<div style="position:absolute;top:0;bottom:0;width:100%;height:100%;"><div id="' + hash + '">';
                        innerHTML += '</div></div>';
                        this.el.innerHTML = innerHTML;
                    }
                } else {
                    this.log(this.mode + ' running as an iframe');

                    if (window.dugout_partner_config.owner_nickname=='sozcu' && this.player_config.pl=='hkigRJ3i') {
                        this.embed_type = 'iframe';
                        this.log('DM player inline');
                        //this.el.style.padding='0';
                        //this.el.style.height='';
                        innerHTML = '<div id="' + this.hash + '" class="dugout-no-float"><div style="position:relative;height:100%;">';
                        innerHTML += '<div class="dailymotion-cpe" playlist="x6obx1" width="100%" no-pip></div>';
                        innerHTML += '<div class="dgtclsbtn"><svg xmlns="http://www.w3.org/2000/svg"><circle class="circle" cx="15" cy="15" r="13" opacity=".3" stroke="#FFF" stroke-width="2.5" stroke-linecap="round" stroke-miterlimit="10" fill="black"></circle><line x1="10" y1="10" x2="20" y2="20" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-miterlimit="10"></line><line x1="20" y1="10" x2="10" y2="20" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-miterlimit="10"></line></svg></div>';
                        innerHTML += '</div></div>';
                        this.el.innerHTML = innerHTML;
                        this.el.firstChild.firstChild.childNodes[1].addEventListener('click', (this.onCloseFloat).bind(this));

                        // Dailymotion CPE code
                        (function(w,d,s,u,n,i,f,g,e,c){w.WDMObject=n;w[n]=w[n]||function(){(w[n].q=w[n].q||[]).push(arguments);};w[n].l=1*new Date();w[n].i=i;w[n].f=f;w[n].g=g;e=d.createElement(s);e.async=1;e.src=u;c=d.getElementsByTagName(s)[0];c.parentNode.insertBefore(e,c);})(window,document,"script","//api.dmcdn.net/pxl/cpe/client.min.js","cpe","5c015cf17f26f301c0f12a31", {scroll_to_pause: true});
                    }
                    else {
                        this.embed_type = 'iframe';
                        innerHTML = '<div id="' + this.hash + '" class="dugout-no-float"><div style="position:relative;height:100%;">';
                        var iframe_url = window.DugoutEmbed.iframe_url + "?p=" + hash;
                        if (this.debug) iframe_url += '&dugout_debug=1';
                        if (window.DugoutEmbed.start_mode) iframe_url += '&video_start='+window.DugoutEmbed.start_mode;
                        if (window.DugoutEmbed.mute_mode) iframe_url += '&video_mute='+window.DugoutEmbed.mute_mode;
                        for (var property in this.attributes) { iframe_url += '&'+property+'='+this.attributes[property];} 
                        innerHTML += '<iframe allow="autoplay; fullscreen" src="' + iframe_url + '" width="100%" height="100%" style="background:black;" frameborder="0" scrolling="no" allowfullscreen></iframe>';
                        innerHTML += '<div class="dgtclsbtn"><svg xmlns="http://www.w3.org/2000/svg"><circle class="circle" cx="15" cy="15" r="13" opacity=".3" stroke="#FFF" stroke-width="2.5" stroke-linecap="round" stroke-miterlimit="10" fill="black"></circle><line x1="10" y1="10" x2="20" y2="20" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-miterlimit="10"></line><line x1="20" y1="10" x2="10" y2="20" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-miterlimit="10"></line></svg></div>';
                        innerHTML += '</div></div>';
                        this.el.innerHTML = innerHTML;
                        this.el.firstChild.firstChild.childNodes[1].addEventListener('click', (this.onCloseFloat).bind(this));
                    }
                    
                }

                // set the floating status
                if (this.embed_type == 'iframe') {
                    if (!window.DugoutEmbed.floating_player) {
                        if (this.mode == "EP" && ("allow_float" in window.dugout_partner_config)) {
                            if (window.DugoutEmbed.is_mobile && window.dugout_partner_config.allow_float == 'mobile') {
                                this.float = true;
                            } else if (!window.DugoutEmbed.is_mobile && window.dugout_partner_config.allow_float == 'desktop') {
                                this.float = true;
                            } else if (window.dugout_partner_config.allow_float == 'always') {
                                this.float = true;
                            }

                        }
                        if (this.mode == "AOP" && ("allow_float_aop" in window.dugout_partner_config)) {
                            if (window.DugoutEmbed.is_mobile && window.dugout_partner_config.allow_float_aop == 'mobile') {
                                this.float = true;
                            } else if (!window.DugoutEmbed.is_mobile && window.dugout_partner_config.allow_float_aop == 'desktop') {
                                this.float = true;
                            } else if (window.dugout_partner_config.allow_float_aop == 'always') {
                                this.float = true;
                            }

                        }

                        if (this.float) {
                            window.DugoutEmbed.floating_player = true; // just one floating player per page
                            this.log('Dugout Player #' + this.ordinal + ': Required to float');
                            window.addEventListener('scroll', (this.onScroll).bind(this));

                            if ("float_onstart" in window.dugout_partner_config &&  window.dugout_partner_config.float_onstart=='1') {
                                this.visible = true;
                                this.log('Force floating on start', this.visible);
                                this.onScroll();
                                this.log('Float after onScroll', this.visible);
                            }
                        }
                    }

                } else if (this.embed_type == 'inline') {

                    // check for a valid playlist
                    var playlist_url;
                    if ('key' in this.player_config && this.player_config.key.length) {
                        playlist_url = 'https://cdn.jwplayer.com/v2/media/' + this.player_config.key;
                    } else if ('pl' in this.player_config && this.player_config.pl.length) {
                        playlist_url = window.DugoutEmbed.getPlaylistURL(this.player_config.pl, null);
                    } else {
                        this.log('Dugout Player #' + this.ordinal + ': No video to play: ', this.player_config);
                        return;
                    }

                    // initialise JWPlayer object
                    this.jwplayer = jwplayer(this.hash);
                    this.jwplayer.dugout = this;

                    // Performance tracking
                    if (this.das_tracking) {
                        this.das = new DugoutAS;
                        this.das.setup(this.player_config.p);
                        if (typeof jwDefaults !== 'undefined') this.das.setPlayerId(jwDefaults.pid);
                        this.das.setPlayerType(this.mode);
                        this.das.setEmbedVersion('iframe.3');
                        this.das.logEvent("player", "load");

                        this.log("EPT enabled");
                    } else this.log("EPT disabled");

                    this.loadPlaylist(playlist_url);
                }

                // receive external events
                window.addEventListener("message", (function(event) {
                    if (event.data && typeof event.data==='string' && event.data.substring(0,9)=='dugout://') {
                        var data = JSON.parse(event.data.substring(9));
                        this.log('Action received:', data);
                        if (!"id" in data) return;
                        if (data.id=='play') this.jwplayer.play();
                        else if (data.id=='pause') this.jwplayer.pause();
                        else if (data.id=='new_video') {
                            var playlist_url;
                            this.player_config = JSON.parse(atob(data.hash));
                            if ("pl" in this.player_config && this.player_config.pl.length) {
                                this.mode = "AOP"; // AOP
                                playlist_url = window.DugoutEmbed.getPlaylistURL(this.player_config.pl, null);
                            }
                            if ("key" in this.player_config && this.player_config.key.length) {
                                this.mode = "EP"; // EP
                                playlist_url = 'https://cdn.jwplayer.com/v2/media/' + this.player_config.key;
                            }
                            this.loadPlaylist(playlist_url);
                        }
                        else if (data.id=='mute') this.jwplayer.setMute(true);
                        else if (data.id=='unmute') { this.jwplayer.setMute(false); this.jwplayer.setVolume(50); }
                    }
                }).bind(this), false);

                this.sendMessage({
                    "id": "playerReady",
                    "publisher_id": window.dugout_partner_config.owner_nickname,
                    "publisher_name": window.dugout_partner_config.owner_display_name
                });
            }
        };

        this.loadPlaylist = function(url) {
            var http = new XMLHttpRequest();
            http.open('GET', url, true);
            http.onload = (function(e) {
                this.playlist = JSON.parse(http.responseText);
                this.log("Playlist loaded with " + this.playlist.playlist.length + " elements", this.playlist);
                this.playPlaylist();
            }).bind(this);
            http.send();
        }

        this.playPlaylist = function() {
            if (!this.playlist || !("playlist" in this.playlist) || !this.playlist.playlist.length) {
                this.log("Playlist is empty or not valid: ", this.playlist);
                return;
            }

            // filter the playlist
            var new_playlist = [];
            for (i in this.playlist.playlist) {
                //this.log(i + ") " + this.playlist.playlist[i].title, this.playlist.playlist[i].owner_nickname);
                if (this.isVideoAllowed(this.playlist.playlist[i])) new_playlist.push(this.playlist.playlist[i]);
            }

            if (this.playlist.playlist.length > new_playlist.length) {
                this.log("Playlist was reduced by " + (this.playlist.playlist.length - new_playlist.length) + " elements");
                this.playlist.playlist = new_playlist;
            }

            if (this.playlist.playlist.length == 0) {
                this.log("Playlist was reduced and now is empty");
                return;
            }

            this.playlist_pos = 0;
            this.playVideo();
        }

        this.playVideo = function() {

            if (window.DugoutEmbed.prebid_wait && !this.prebid_bids && this.wait_loops<20) {
                this.wait_loops++;
                setTimeout((this.playVideo).bind(this), 100);
                return;
            }

            if (window.DugoutEmbed.gdpr && !window.DugoutEmbed.gdpr_consent && this.wait_loops<20) {
                this.wait_loops++;
                setTimeout((this.playVideo).bind(this), 100);
                return;
            }

            this.log("playVideo() conditions met?", (this.wait_loops<20) ? 'YES' : 'NO');
            this.log("Prebid:", window.DugoutEmbed.prebid_wait, this.prebid_bids, this.wait_loops);
            this.log("GDPR:", window.DugoutEmbed.cmp_detected, window.DugoutEmbed.gdpr, window.DugoutEmbed.gdpr_consent);


            // Send CMP detection data
            $cmp = 4; // CMP not detected
            if (window.DugoutEmbed.cmp_detected) {
                // CMP detected
                if (window.DugoutEmbed.gdpr==0) {
                    $cmp = 0;
                    this.log('CMP present but GDPR doesnt apply');
                }
                else {
                    if (window.DugoutEmbed.gdpr_consent && window.DugoutEmbed.gdpr_consent.length) {
                        $cmp = 1;
                        this.log('CMP present and consent string available');
                    }
                    else {
                        $cmp = 2;
                        this.log('CMP present but consent string not available');
                    }
                }
            }
            else {
                // CMP not present
                this.log('CMP not present');
            }
            this.das.setPlayerVerticalPos($cmp);
            this.track('ready', this.current_video_id, this.playlist_pos);
            

            this.log("Playing video #" + this.playlist_pos);

            this.wait_loops=0;

            var tmp_playlist = JSON.parse(JSON.stringify(this.playlist));
            tmp_playlist.playlist = [this.playlist.playlist[this.playlist_pos]];

            var config = JSON.parse(JSON.stringify(this.player_defaults));

            if ("advertising" in config) {
                if ("preloadAds" in config.advertising) config.advertising.preloadAds=false;
                config.advertising.schedule = this.buildAdTag(this.playlist.playlist[this.playlist_pos]);
            }

            if (window.DugoutEmbed.is_mobile && 
                "mobile_autoplay" in dugout_partner_config && 
                dugout_partner_config.mobile_autoplay=="click") config.autostart=false;

            if (window.DugoutEmbed.start_mode) {
                switch (window.DugoutEmbed.start_mode) {
                    case 'clicktoplay': config.autostart = false; break;
                    case 'playinview': config.autostart = "viewable"; break;
                }
            }
            if (window.DugoutEmbed.mute_mode) {
                config.mute = (window.DugoutEmbed.mute_mode=='true');
            }

            if (this.user_muted>-1) {
                // respect user's latest settings in the previous video
                config.mute = this.user_muted;
                if (!this.user_muted && this.user_volume>-1) config.volume = this.user_volume;
            }

            config.playlist = tmp_playlist;

            // setup the player
            this.log("Player setup config", config);
            this.jwplayer.setup(config);
            this.jwplayer.on('ready', this.onReady);
            this.jwplayer.on('viewable', this.onViewable);
            this.jwplayer.on('adImpression', this.onAdImpression);
            this.jwplayer.on('firstFrame', this.onFirstFrame);
            this.jwplayer.on('playlistItem', this.onPlaylistItem);
            this.jwplayer.on('beforePlay', this.onBeforePlay);
            this.jwplayer.on('playlistComplete', this.onPlaylistComplete);

            this.jwplayer.on('setupError', function(error) { this.dugout.track('setup-error', error.code); });
            this.jwplayer.on('error', function(error) { this.dugout.track('jw-error', error.code); });
            this.jwplayer.on('adError', function(error) { this.dugout.track('ad-error', error.code); });
            this.jwplayer.on('adBlock', function() { this.dugout.track('ad-blocker'); this.dugout.log('Ad blocker detected'); });

            this.jwplayer.on('play', function(event) {
                this.dugout.sendMessage({
                    "id": "playStart",
                    "viewable": event.viewable
                });
            });

            this.jwplayer.on('pause', function(event) {
                this.dugout.sendMessage({
                    "id": "playPause",
                    "viewable": event.viewable
                });
            });

            this.jwplayer.on('complete', function() {
                this.dugout.sendMessage({
                    "id": "playComplete",
                });
                this.dugout.user_muted = this.getMute();
                this.dugout.user_volume = this.getVolume();
            });

            if (window.DugoutEmbed.amp) {
                (window.AmpVideoIframe = window.AmpVideoIframe || []).push(
                    (function(ampIntegration) {
                        this.log("AmpIntegrationReady!", this.jwplayer, ampIntegration);
                        ampIntegration.listenTo('jwplayer', this.jwplayer);
                    }).bind(this)
                );
            }
        }

        this.onReady = function() {
            if (this.dugout.tracking && this.dugout.das_tracking) {
                var p = document.getElementById(this.dugout.hash);
                this.dugout.playerWidth = p.clientWidth;
                this.dugout.das.setPlayerSize(p.clientWidth + 'x' + p.clientHeight);
            }
            //this.dugout.track('ready', this.dugout.current_video_id, this.dugout.playlist_pos);
        }

        this.onViewable = function(player) {
            if (!this.dugout.jw_viewable && player.viewable) {
                this.dugout.jw_viewable = 1;
                this.dugout.track('in-view', this.dugout.current_video_id);
            }
            if (this.dugout.jw_viewable == 1 && !player.viewable) {
                this.dugout.jw_viewable = 2;
                this.dugout.track('lost-view', this.dugout.current_video_id);
            }
        };

        this.onAdImpression = function(event) {
            this.dugout.track('ad-impression', this.dugout.current_video_id, this.dugout.playlist_pos);
            if (typeof moatjw !== 'undefined') {
                // record moat event
                /*moatjw.add({
                    partnerCode: "dugoutimavideo825101166218",
                    player: this,
                    zMoatpublisherid: window.dugout_partner_config.owner_nickname, // publisher_id
                    zMoatplayertype: this.dugout.mode, // EP | AOP
                    zMoattest: this.dugout.playerWidth, //player width
                    adImpressionEvent: event
                });*/
            }
            this.dugout.sendMessage({
                "id": "adImpression",
                "adTag": event.tag
            });
        }

        this.onFirstFrame = function(event) {
            this.dugout.track('first-frame', this.dugout.current_video_id, this.dugout.playlist_pos);
            this.dugout.tracking = false;
            this.dugout.sendMessage({
                "id": "newVideo",
                "event": event.viewable,
                "video": {
                    "id": this.dugout.current_video_id,
                    "title": this.getPlaylistItem(this.dugout.playlist_pos).title,
                    "duration": this.getPlaylistItem(this.dugout.playlist_pos).duration,
                }
            });
        };

        this.buildAdTag = function(video) {
            var new_adschedule = null;

            if (!window.DugoutEmbed.show_ads) return null;

            if (this.player_defaults && "advertising" in this.player_defaults) {
                // the player has an adschedule attached and it has schedules
                this.log('Base Ad Schedule: ', this.player_defaults.advertising);

                var producer = video.owner_nickname; // the club nickname

                // set defaults
                video.allow_ads = video.allow_ads || 'yes';
                window.dugout_partner_config.allow_ads = window.dugout_partner_config.allow_ads || 'yes';

                // check if we allow ads for this video
                var allow_ads = true;
                if (video.allow_ads == 'no') allow_ads = false;
                if ((producer in window.dugout_producers_config) && ('allow_ads' in window.dugout_producers_config[producer]) && window.dugout_producers_config[producer].allow_ads == 'no') allow_ads = false;

                if (!allow_ads) {
                    this.log('Ads not allowed');
                    return null;
                }

                // video tags
                var tags = video.tags.split(",");

                try {
                    new_adschedule = JSON.parse(JSON.stringify(this.player_defaults.advertising.schedule));
                }
                catch(e) {
                    this.log('Error in the advertising schedule', this.player_defaults.advertising.schedule);
                    return '';
                }

                // now replace the macro variables
                for (i = 0; i < new_adschedule.length; i++) {

                    var custparams = [];
                    for (j in tags) {
                        if (tags[j].indexOf('ln-') === 0) custparams.push(('ln%3D' + tags[j]));
                        if (tags[j].indexOf('bx-') === 0) custparams.push(('bx%3D' + tags[j]));
                        if (tags[j].indexOf('cp-') === 0) custparams.push(('cp%3D' + tags[j]));
                        //if (tags[j].indexOf('cl-') === 0) custparams.push(('cl%3D' + tags[j]));
                        if (tags[j].indexOf('pl-') === 0) custparams.push(('pl%3D' + tags[j]));
                    }

                    this.log('Custom params:', custparams.join('%26'));

                    var adtag = new_adschedule[i].tag;
                    var was_adtag_array = true;
                    if (!Array.isArray(adtag)) {
                        // IMA
                        adtag = [adtag];
                        was_adtag_array = false;
                    }

                    var new_tag = '';
                    for (j in adtag) {
                        if ("ad_tag" in window.dugout_partner_config && window.dugout_partner_config.ad_tag.length) {
                            if (window.dugout_partner_config.ad_tag.substring(0, 2) == "@@") {
                                this.log('@@ in the ad_tag: ', window.dugout_partner_config.ad_tag);
                                var eval_string = "adtag[j]=" + window.dugout_partner_config.ad_tag.substring(2);
                                this.log('eval: ', eval_string);
                                eval(eval_string);
                                this.log('Resulting ad tag: ', adtag[j]);
                            } else adtag[j] = window.dugout_partner_config.ad_tag;
                        }

                        var player_width = document.getElementById(this.hash).clientWidth;
                        this.log('buildAdTag()::player_width', player_width);
                        this.log('buildAdTag()::pod', this.pod);

                        var player_size = '';
                        if (player_width<300) player_size='XS';
                        else if (player_width<401) player_size='S';
                        else if (player_width<601) player_size='M';
                        else player_size='L';

                        var visible = this.jwplayer.getViewable();

                        console.log('------ QUERY STRING FROM AD TAG', window.DugoutEmbed.query_string);

                        new_tag = adtag[j].replace(/__embed_partner__/g, window.dugout_partner_config.owner_nickname)
                            .replace(/__producer_partner__/g, producer)
                            .replace(/__allow_ads__/g, allow_ads ? "yes" : "no")
                            .replace(/__content_tags__/g, custparams.join('%26'))
                            .replace(/__npa__/g, window.DugoutEmbed.npa)
                            .replace(/__pod__/g, this.pod)
                            .replace(/__type__/g, (this.float) ? 'float' : 'std')
                            .replace(/__player_size__/g, player_size)
                            .replace(/__visible__/g, visible)
                            .replace(/__audio__/g, (window.DugoutEmbed.mute_mode=='true') ? 'on' : (this.player_defaults.mute ? 'off' : 'on'))
                            .replace(/__mode__/g, (this.player_defaults.autostart=='viewable') ? 'in_view' : (this.player_defaults.autostart===true ? 'autoplay' : 'click_to_play'))
                            .replace(/__rounded_duration__/g, Math.round(video.duration))
                            .replace(/__device_id__/g, encodeURIComponent(window.DugoutEmbed.query_string.device_id||''))
                            .replace(/__app_bundle__/g, encodeURIComponent(window.DugoutEmbed.query_string.app_bundle||''))
                            .replace(/__app_name__/g, encodeURIComponent(window.DugoutEmbed.query_string.app_name||''))
                            .replace(/__app_store_url__/g, encodeURIComponent(window.DugoutEmbed.query_string.app_store_url||''))
                            .replace(/__bild_device__/g, (window.DugoutEmbed.is_mobile) ? "mew" : "desktop");

                        if (window.DugoutEmbed.gdpr_consent) {
                            new_tag = new_tag.replace(/__gdpr_consent__/g, window.DugoutEmbed.gdpr_consent).replace(/__gdpr__/g, "1");
                        }

                        new_adschedule[i].tag[j] = new_tag;
                    }

                    if (window.DugoutEmbed.prebid) {
                        if (this.prebid_bids==2) { // 1: auction with no bids; 2: auction with bids
                            // we have bids available
                            this.log("buildAdTag(): Adtag before prebid: ", adtag);

                            var prebid_adtag;

                            if (window.dugout_partner_config.owner_nickname=='dugout-live') {
                                var highestCpmBids = window.pbjs.getHighestCpmBids('dugout_player'); // pass the ad unit name
                                prebid_adtag = highestCpmBids[0].vastUrl;
                                this.log('buildAdTag(): Bypassing DFP', prebid_adtag);
                            }
                            else {
                                prebid_adtag = window.pbjs.adServers.dfp.buildVideoUrl({
                                    adUnit: window.prebid_adunit,
                                    url: new_tag,
                                });
                                this.log('buildAdTag(): Merging DFP tag with prebid', prebid_adtag);
                            }
                            
                            if (prebid_adtag.length) new_tag = prebid_adtag;
                            this.log("buildAdTag(): Prebid adtag: ", prebid_adtag);
                        } else {
                            // we don't have bids
                            this.log('buildAdTag(): No bids available from Prebid');
                        }
                        this.requestPrebidVideoAd();
                    }

                    this.log('Ad tag: ', new_tag, new_adschedule);

                    if (!was_adtag_array) {
                        new_adschedule[i].tag = new_tag;
                    }
                }
            } else {
                this.log('No adschedule detected.');

            }

            return new_adschedule;
        };

        // ONPLAYLISTITEM ----------------------------------------------
        this.onPlaylistItem = function(video) {

            this.dugout.current_video_id = video.item.mediaid;
            this.dugout.new_video = true;

            this.dugout.track('playlist-item', this.dugout.current_video_id, this.dugout.playlist_pos);
            this.dugout.log('Playing video #' + this.dugout.playlist_pos + ': ', video.item.owner_nickname, video.item.title);
            this.dugout.log('Video metadata: ', video);

            this.dugout.pod++;
        };

        this.isVideoAllowed = function(video) {
            var allow_embeds = true;
            var producer = video.owner_nickname;

            if ("allow_embed" in video && video.allow_embed == "no") allow_embeds = false;
            else {
                // if the producer/club has an entry in the clubs settings
                if (typeof window.dugout_producers_config !== 'undefined' && producer in window.dugout_producers_config) {
                    // check if producer/club allows embeds
                    if ('allow_embeds' in window.dugout_producers_config[producer] &&
                        window.dugout_producers_config[producer].allow_embeds == 'no') {
                        allow_embeds = false;
                        //this.log(producer + " doesn't allow embeds. Video removed from the playlist");
                    }

                    // check disallowed publishers for this producer/club
                    if ('disallowed' in window.dugout_producers_config[producer]) {
                        for (publisher in window.dugout_producers_config[producer].disallowed) {
                            if (window.dugout_producers_config[producer].disallowed[publisher] == window.dugout_partner_config.owner_nickname) {
                                allow_embeds = false;
                                //this.log(producer + " doesn't allow " + window.dugout_partner_config.owner_nickname + " to play its videos. Video removed from the playlist");
                            }
                        }
                    }

                    // check blacklisted publishers for this producer/club
                    if ('blacklisted' in window.dugout_producers_config[producer]) {
                        for (domain in window.dugout_producers_config[producer].blacklisted) {
                            if (window.dugout_producers_config[producer].blacklisted[domain] == window.DugoutEmbed.rootDomain) {
                                allow_embeds = false;
                                //this.log(producer + " doesn't allow " + window.DugoutEmbed.rootDomain + " to embed its videos. Video removed from the playlist");
                            }
                        }
                    }
                }
            }

            return (allow_embeds);
        };

        this.onPlaylistComplete = function() {
            // This function runs in JWPlayer's context
            this.dugout.playlist_pos++;
            this.dugout.log('Playlist complete. Moving to next video.');
            if (this.dugout.playlist_pos < this.dugout.playlist.playlist.length) {
                this.dugout.playVideo();
            } else {
                // We need more videos
                if (typeof window.dugout_partner_config.follow_up_playlist !== "undefined" && window.dugout_partner_config.follow_up_playlist.length) {
                    var playlist_url = window.DugoutEmbed.getPlaylistURL(window.dugout_partner_config.follow_up_playlist, this.dugout.playlist.playlist[this.dugout.playlist_pos - 1]);
                    this.dugout.log("Loading new playlist: ", window.dugout_partner_config.follow_up_playlist, playlist_url);
                    if (playlist_url.length) this.dugout.loadPlaylist(playlist_url);
                    else this.dugout.log("Playlist URL not valid. EOL.");
                } else {
                    this.dugout.log("No more videos to show. EOL.")
                }
            }
        };

        // FLOATING FUNCTIONS --------------------
        this.onScroll = function() {
            if (this.float) {
                var now_visible = this.isInViewport(this.el);
                if (now_visible != this.visible) {
                    if (!now_visible) {
                        if ("float_position" in window.dugout_partner_config) {
                            if (window.dugout_partner_config.float_position=='custom') {
                                console.log('CUSTOM FLOATING ---------', window.dugout_partner_config.float_custom);
                                var custom = JSON.parse(window.dugout_partner_config.float_custom);
                                console.log('custom config', window.dugout_partner_config.float_custom, custom);
                                
                                if (custom && window.DugoutEmbed.is_mobile && "mobile" in custom) custom=custom.mobile;
                                else if (custom && !window.DugoutEmbed.is_mobile && "desktop" in custom) custom=custom.desktop;
                                else custom = null;
                                
                                if (custom) {
                                    this.float_position = 'custom';
                                    this.float_style = {};

                                    if (custom.element) {
                                        var el = document.querySelectorAll(custom.element);
                                        console.log('FLOAT REF ELEMENT', el);
                                        if (el && el.length) {
                                            el=el[0];
                                            this.float_style.top = el.offsetTop;
                                            this.float_style.left = el.offsetLeft;
                                        }
                                    }
                                    if (custom.dtop) this.float_style.top = this.float_style.top + custom.dtop;
                                    if (custom.dleft) this.float_style.left = this.float_style.left + custom.dleft;
                                    if (custom.top) this.float_style.top = custom.top;
                                    if (custom.left) this.float_style.left = custom.left;
                                    if (custom.bottom) { this.float_style.bottom = custom.bottom; delete(this.float_style.top); }
                                    if (custom.right) { this.float_style.right = custom.right; delete(this.float_style.left); }
                                    if (custom.width) { 
                                        this.float_style.maxWidth = custom.width; 
                                        this.float_style.maxHeight = custom.width * 9/16; 
                                        this.float_style.height = custom.width * 9/16; 
                                    }
                                }
                                console.log('CUSTOM FLOAT STYLE: ', this.float_style);

                                for (property in this.float_style) {
                                    console.log("Changing ", property, " to ", this.float_style[property]);
                                    this.el.firstChild.style[property] = this.float_style[property]+"px";
                                }
                                this.el.firstChild.className = 'dugout-float';
                                console.log("DUGOUT FLOAT CUSTOM:", this.el.firstChild.style, this.el.firstChild.className);
                            }
                            else {
                                this.float_position = 'dugout-float-' + window.dugout_partner_config.float_position;
                                this.el.firstChild.className = 'dugout-float '+this.float_position;
                            }
                        }
                    }
                    else {
                        this.el.firstChild.className = 'dugout-no-float';
                        this.el.firstChild.removeAttribute("style");
                        console.log('FLOAT NO');
                    }
                    this.visible = now_visible;
                }
            }
        };

        this.onCloseFloat = function() {
            this.log('Close floating player');
            this.el.firstChild.className = 'dugout-no-float';
            this.el.firstChild.removeAttribute("style");
            this.float = false;
        };

        this.isInViewport = function(el) {
            if (!el) return false;
            var bounding = el.getBoundingClientRect();
            var y_limit = (bounding.bottom - bounding.top) / 2;
            return (
                bounding.top >= -y_limit &&
                bounding.left >= 0 &&
                bounding.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
                bounding.right <= (window.innerWidth || document.documentElement.clientWidth)
            );
        };

        // PREBID FUNCTION ----------------------
        this.requestPrebidVideoAd = function() {
            if (window.DugoutEmbed.prebid) {
                
                this.log('requestPrebidVideoAd(): ', 'Requesting bids...');
                this.prebid_bids = false;

                window.pbjs.que.push((function() {
                    window.pbjs.requestBids({
                        bidsBackHandler: (function(bids) {
                            this.log('requestPrebidVideoAd(): Returned bids', bids);
                            if (typeof bids !== 'undefined' && "dugout_player" in bids) {
                                // prebid bid received
                                this.prebid_bids = 2;
                                //this.track('prebid', 2);
                            }
                            else {
                                // empty prebid response
                                this.prebid_bids = 1;
                                //this.track('prebid', 1);
                            }
                        }).bind(this)
                    });
                }).bind(this));
            }
        };

        // TRACKING FUNCTION -----------------------
        this.track = function(label, extra, value, error) {

            if (typeof extra === "undefined") extra = "";
            if (typeof value === "undefined") value = null;
            if (typeof error === "undefined") error = false;

            var self = this;
            if (typeof this.dugout !== 'undefined') {
                self = this.dugout;
            }

            if (self.tracking) {
                // GA Events Flow tracking
                if (window.DugoutEmbed.ga_event_tracking) {
                    var action = self.player_config.p + '_' + self.mode;
                    var ts = 0;

                    if (window.DugoutEmbed.is_mobile) action += '_mobile';
                    else action += '_desktop';
                    if (error) action += '_error';
                    if (value) ts = value;
                    else if (typeof performance.now === 'function') ts = ((performance.now()) / 1000).toFixed(2);

                    if (typeof self.last_event === 'undefined') self.last_event = 'origin';
                    var final_label = label + ' (after ' + self.last_event + ')';
                    self.last_event = label;

                    self.log('// Track: ', action, final_label, ts);

                    window.DugoutEmbed.gaTrack([{
                        type: 'event',
                        ec: action,
                        ea: final_label,
                        el: extra,
                        ev: ts
                    }]);
                }

                if (self.das_tracking && self.das) {
                    // DAS tracking
                    self.das.logEvent("player", label, extra, value);
                }
            }
        };

        // MESSAGING THROGH IFRAMES -------------
        this.sendMessage = function(data) {
            window.parent.postMessage("dugout://"+JSON.stringify(data), "*");
        };
    };
}

window.DugoutEmbed.checkCMP();