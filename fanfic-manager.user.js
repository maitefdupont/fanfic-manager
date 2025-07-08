// ==UserScript==
// @name        FanficManager
// @license MIT
// @version     1
// @namespace   window
// @description  Manage your fanfiction library
// @include     https://www.fanfiction.net/*
// @include     https://archiveofourown.org/*
// @include     http://archiveofourown.org/*
// @include     http://www.archiveofourown.org/*
// @include     https://www.archiveofourown.org/*
// @run-at      document-end

// @require     https://code.jquery.com/jquery-1.7.2.min.js
// @require     https://greasyfork.org/scripts/17419-underscore-js-1-8-3/code/Underscorejs%20183.js?version=109803
// @grant       GM_addStyle

// ==/UserScript==

// Authors:
const AUTHOR_LIKED = 0;
const AUTHOR_DISLIKED = 1;

// Fics:
const FIC_IGNORED = -1;
const FIC_PLANNED = 99;
const FIC_DROPPED = 0;

const FIC_DISLIKED = 1;
const FIC_LIKED = 2;
const FIC_LOVED = 3;
const FIC_READ = 4;


// colors. now used for like/dislike/etc links
const COLOR_IGNORED = 'black';
const COLOR_PLANNED = '#F1D173';
const COLOR_DROPPED = 'gray';
const COLOR_DISLIKED = 'red';
const COLOR_LIKED = 'blue';
const COLOR_LOVED = 'green';
const COLOR_READ = '#bbb';

const ficStatus = {
  ignored: { value: FIC_IGNORED, color: COLOR_IGNORED, class: 'ffn_ignored_fic'},
  planned: { value: FIC_PLANNED, color: COLOR_PLANNED, class: 'ffn_planned_fic' },
  dropped: { value: FIC_DROPPED, color: COLOR_DROPPED, class: 'ffn_dropped_fic' },
  disliked: { value: FIC_DISLIKED, color: COLOR_DISLIKED, class: 'ffn_disliked_fic' },
  liked: { value: FIC_LIKED, color: COLOR_LIKED, class: 'ffn_liked_fic' },
  loved: { value: FIC_LOVED, color: COLOR_LOVED, class: 'ffn_loved_fic' },
  read: { value: FIC_READ, color: COLOR_READ, class: 'ffn_read_fic' },
}

const appOptions = {
  hidePlanned: "hide_planned",
  hideIgnored: "hide_ignored",
  hideLikes: "hide_likes",
  hideMarked: "hide_marked",
  hideDislikes: "hide_dislikes"
}
const getFicStatus = (sttValue) => Object.values(ficStatus).find((status) => status.value === sttValue);

const DB_NAME = 'FFManager';

const commonStyle = 'padding-left: 5px; border-bottom: 1px solid white !important; color: black';
var style = (color, read) => `{border-left: 10px solid ${color} !important; background: ${read ? COLOR_READ : ''}; ${commonStyle}}`;
// styles for box background
//AUTHOR
GM_addStyle(`.ffn_like_author {border-left: 5px solid ${COLOR_LOVED} !important; background: ${COLOR_READ}; color: black}`);
GM_addStyle(`.ffn_dislike_author {border-left: 5px solid ${COLOR_DISLIKED} !important; background: ${COLOR_READ}; color: black}`);
//FIC
GM_addStyle(`.${ficStatus.ignored.class} {background-color:${ficStatus.ignored.color} !important;}`);
GM_addStyle(`.${ficStatus.planned.class} ${style(ficStatus.planned.color, true)}`);
GM_addStyle(`.${ficStatus.dropped.class} ${style(ficStatus.dropped.color, false)}`);
GM_addStyle(`.${ficStatus.disliked.class} ${style(ficStatus.disliked.color, true)}`);
GM_addStyle(`.${ficStatus.liked.class} ${style(ficStatus.liked.color, true)}`);
GM_addStyle(`.${ficStatus.loved.class} ${style(ficStatus.loved.color, true)}`);
GM_addStyle(`.${ficStatus.read.class} ${style(ficStatus.read.color, true)}`);
GM_addStyle(`.ffn_story_tooltip {position: absolute; background: white; padding: 5px; width: 30%; z-index: 1000;}`);

// prevent conflicts with websites' jQuery version
this.ffn$ = this.jQuery = jQuery.noConflict(true);

var db = JSON.parse(localStorage.getItem(DB_NAME) || '{}');
db.options = db.options || {};

//
// APP
//

// Main
var patharr = window.location.pathname.split("/");

var Application = function Application(optionsin) {
  var a = {};
  var options = optionsin || {};

  if (!options.namespace) { throw new Error("namespace is required"); }
  if (!options.db) { throw new Error("database object is required"); }

  a.namespace = options.namespace;
  var db = options.db;
  db[a.namespace] = db[a.namespace] || { fic: {}, author: {} };

  a.collection = [];

  a.save = function (type, id, value) {
    if (type == "fic" || type == "author") {
      a.saveNameSpaced(type, id, value);
    } else {
      if (value === "clear") {
        delete db[type][id];
      } else {
        db[type][id] = value;
      }
      localStorage.setItem(DB_NAME, JSON.stringify(db));
    }
  };

  a.saveNameSpaced = function (type, id, value) {
    if (value === "clear") {
      delete db[a.namespace][type][id];
    } else {
      if (typeof (db[a.namespace][type]) == 'undefined') {
        db[a.namespace][type] = {};
      }
      db[a.namespace][type][id] = value;
    }
    localStorage.setItem(DB_NAME, JSON.stringify(db));
  };

  a.author = {};

  a.author.get = function (id) {
    return db[a.namespace].author[id];
  };

  a.author.like = function (id) {
    a.save("author", id, AUTHOR_LIKED);

    _.each(a.author.getFics(id), function (story) {
      story.author = AUTHOR_LIKED;
      story.likeAuthor();
    });
  };

  a.author.dislike = function (id) {
    a.save("author", id, AUTHOR_DISLIKED);
    _.each(a.author.getFics(id), function (story) {
      story.author = AUTHOR_DISLIKED;
      story.dislikeAuthor();
    });
  };

  a.author.clear = function (id) {
    a.save("author", id, "clear");

    _.each(a.author.getFics(id), function (story) {
      story.author = '';
      story.clearAuthor();
    });
  };

  a.author.getFics = function (id) {
    return _.filter(a.collection, function (story) {
      return story.authorId() == id;
    });
  };

  a.fic = {};

  a.fic.get = function (id) {
    return db[a.namespace].fic[id];
  };

  a.fic.update = function (id, status) {
    var prevComment = a.fic.get(id)?.comment;
    var value = { value: status.value, comment: prevComment ?? '' };
    a.save("fic", id, value);
    var story = _.find(a.collection, function (story) {
      return story.ficId() == id;
    });

    story.fic = value;
    story.setEntryStyle(status);
    story.hide(app.options);
  };
  
  a.fic.clear = function (id) {
    a.save("fic", id, "clear");
    var story = _.find(a.collection, function (story) {
      return story.ficId() == id;
    });
    delete story.fic;
    story.clearStory();
  };

  a.fic.showComment = function (id) {
    var story = _.find(a.collection, function (story) {
      return story.ficId() == id;
    });
    story.showComment();
  };

  a.fic.hideComment = function (id) {
    var story = _.find(a.collection, function (story) {
      return story.ficId() == id;
    });
    story.hideComment();
  };

  a.fic.updateComment = function (id) {
    var story = _.find(a.collection, function (story) {
      return story.ficId() == id;
    });

    if (!story.fic) return;
    var prevComment = story.fic.comment;
    var comment = prompt('Comment:', prevComment ?? '');
    if (comment === null) return;

    var value = { value: story.fic.value, comment: comment };
    app.save("fic", id, value);
    story.fic = value;
  };

  a.options = function (name, value) {
    if (!name) { throw new Error("name is required. what option are you looking for?"); }

    if (typeof value !== "undefined") {
      a.save("options", name, value);
      return false;
    } else {
      return db.options[name];
    }
  };

  return a;
};

var appDefault = (domElement) => ({
  template: function () {
    var template = `<div class="new_like_actions" style="margin-top: 5px; text-align: center;">
      <div style="display: inline-block; padding: 5px 5px 5px 5px; background: white;">
      Story:
      <a href="" class="story_comments">&#x1F4AC;</a>
      <a href="" class="plan_story"><font color="${ficStatus.planned.color}">Planned</font></a> | 
      <a href="" class="ignore_story"><font color="${ficStatus.ignored.color}">Ignored</font></a> | 
      <a href="" class="read_story"><font color="${ficStatus.read.color}">Read</font></a> | 
      <a href="" class="love_story" ><font color="${ficStatus.loved.color}">Loved</font></a> | 
      <a href="" class="like_story"><font color="${ficStatus.liked.color}">Liked</font></a> | 
      <a href="" class="dislike_story"><font color="${ficStatus.disliked.color}">Disliked</font></a> | 
      <a href="" class="drop_story"><font color="${ficStatus.dropped.color}">Dropped</font></a> | 
      <a href="" class="clear_story"> Clear</a>
      &nbsp;&nbsp;&nbsp;
      Author: <a href="" class="like_author">Like</a> | 
      <a href="" class="dislike_author">Dislike</a> | 
      <a href="" class="clear_author">Clear</a>

      </div></div>`;
    return template;
  },
  addActions: function () {
    domElement.append(this.template());
    
    var actions = domElement.find('.new_like_actions');
    var ficId = this.ficId();
    var authorId = this.authorId();
    
    actions.find('.like_author').click(function () { app.author.like(authorId); return false; });
    actions.find('.dislike_author').click(function () { app.author.dislike(authorId); return false; });
    actions.find('.clear_author').click(function () { app.author.clear(authorId); return false; });
    actions.find('.read_story').click(function () { app.fic.update(ficId, ficStatus.read); return false; });
    actions.find('.love_story').click(function () { app.fic.update(ficId, ficStatus.loved); return false; });
    actions.find('.like_story').click(function () { app.fic.update(ficId, ficStatus.liked); return false; });
    actions.find('.dislike_story').click(function () { app.fic.update(ficId, ficStatus.disliked); return false; });
    actions.find('.ignore_story').click(function () { app.fic.update(ficId, ficStatus.ignored); return false; });
    actions.find('.plan_story').click(function () { app.fic.update(ficId, ficStatus.planned); return false; });
    actions.find('.drop_story').click(function () { app.fic.update(ficId, ficStatus.dropped); return false; });
    actions.find('.clear_story').click(function () { app.fic.clear(ficId); return false; });
    actions.find('.story_comments').hover(function () { app.fic.showComment(ficId); return false; }, function () { app.fic.hideComment(ficId); return false; });
    actions.find('.story_comments').click(function () { app.fic.updateComment(ficId); return false; });
  },
  hide: function () {
    this._hide();
  },
  _hide: function () {
    var status = this.fic?.value;
    if (
      (app.options("hide_dislikes") && status === FIC_DISLIKED) ||
      (app.options("hide_likes") && status === FIC_LIKED) ||
      (app.options("hide_marked") && [FIC_READ, FIC_LOVED, FIC_LIKED, FIC_DISLIKED, FIC_DROPPED, FIC_IGNORED].includes(status)) ||
      (app.options("hide_ignored") && status === FIC_IGNORED) ||
      (app.options("hide_planned") && status === FIC_PLANNED)) {
      domElement.hide();
      }
    },
  setEntryStyle: function (status) {
    if (this.fic === undefined || status === undefined) return;
    this.clearStory();
    domElement.addClass(status.class);
  },
  showComment: function () {
    if (this.fic === undefined || this.fic.comment === null || this.fic.comment === undefined || this.fic.comment === '') return;
    var div = document.createElement('div');
    div.classList.add('ffn_story_tooltip');
    div.textContent = this.fic.comment;
    domElement.find('.story_comments').append(div);
  },
  hideComment: function () {
    var tooltip = domElement.find('.story_comments div');
    if (tooltip === undefined || tooltip.length == 0) return;
    tooltip[0].remove();
  },
  setAuthorStyle: function () {
    if (this.author === AUTHOR_LIKED) {
      this.$author.addClass("ffn_like_author");
    }
    if (this.author === AUTHOR_DISLIKED) {
      this.$author.addClass("ffn_dislike_author");
    }
  },
  clearStory: function () {
    var allClasses = Object.keys(ficStatus).map((status) => ficStatus[status].class).join(' ');
    domElement.removeClass(allClasses);
    this.$fic.removeClass(allClasses);
  },
  likeAuthor: function () {
    this.clearAuthor();
    this.$author.addClass("ffn_like_author");
  },
  dislikeAuthor: function () {
    this.clear_author();
    this.$author.addClass("ffn_dislike_author");
  },
  clearAuthor: function () {
    domElement.removeClass("ffn_like_author ffn_dislike_author");
    this.$author.removeClass("ffn_like_author ffn_dislike_author");
  }
});

var appFFnet = (_this) => ({
  $author: _this.find('a[href^="/u"]:first'),
  $fic: _this.find('a[href^="/s"]:first'),
  authorId: function () {
    if (typeof this.$author.attr('href') === "undefined") {
      return patharr[2];
    } else {
      return this.$author.attr('href').split('/')[2];
    }
  },
  ficId: function () {
    if (this.$fic.length === 0) {
      return patharr[2];
    } else {
      return this.$fic.attr('href').split('/')[2];
    }
  },
  hide: function () {
    // do not hide story header on reading page and story block on author page
    // if (!patharr[1].match("^s$|^u$")) _this.hide(); // do not hide fic on author pages (to clearly see how many fics you like and dislike) and on reading pages
    if (!patharr[1].match("^s$")) this._hide(); // do not hide fic on reading pages
  }
});

var appAO3 = (_this) => ({
  $author: _this.find('a[href^="/users/"]:first'),
  $fic: _this.find('a[href^="/works/"]:first'),
  authorId: function () {
    if (this.$author.length === 0) {
      return 0;
    } else {
      return this.$author.attr('href').split('/')[2];
    }
  },
  ficId: function () {
    if (this.$fic.length === 0) {
      return patharr[2];
    } else {
      return this.$fic.attr('href').split('/')[2];
    }
  },
  hide: function () {
    if (patharr[1] !== "users" &&    // do not hide fic on author pages (to clearly see how many fics you like and dislike)
      !/(collections\/[^\/]+\/)?works\/\d+/.test(window.location.pathname)) { // do not hide fic header on reading pages)
      this._hide();
    }
  }
});

var appNamespace = {
  "www.fanfiction.net": appFFnet,
  "archiveofourown.org": appAO3,
};

var Story = function (optionsin) {
  var a = {};
  var options = optionsin || {};

  if (!options.instance) { throw new Error("instance of this is required"); }
  if (!options.namespace) { throw new Error("namespace is required"); }
  
  var domElement = ffn$(options.instance);
  // Specific sites overrides
  
  var storyEntry = ffn$.extend({}, appDefault(domElement), appNamespace[options.namespace](domElement));
  storyEntry.fic = app.fic.get(storyEntry.ficId());
  storyEntry.setEntryStyle(getFicStatus(storyEntry.fic?.value));

  storyEntry.author = app.author.get(storyEntry.authorId());
  storyEntry.setAuthorStyle();

  if (storyEntry.ficId() !== 0 && storyEntry.authorId() !== 0) {
    storyEntry.addActions();
  }

  storyEntry.hide(app.options);//hides if necessary
  return storyEntry;
};

var pluginActions = '<div class="liker_script_options" style="padding:5px; border 1px solid black; background:#D8D8FF;">' +
  '<b>Liker Options:</b> ' +
  '</div>';

function addActionLinksFFnet() {
  // small tweak to allow text selection
  GM_addStyle("* {user-select:text !important;}");
  // adding hotkeys
  // added toggle option, suggested by Vannius
  if (app.options("enable_list_hotkeys")) {
    document.addEventListener('keydown', function (e) {
      if (!e.ctrlKey && !e.altKey && !e.shiftKey) {
        switch (e.keyCode) {
          case 37:
            var Prev = ffn$("a:contains('« Prev')");
            if (typeof (Prev[0]) !== 'undefined') { Prev[0].click(); }
            break;
          case 39:
            var Next = ffn$("a:contains('Next »')");
            if (typeof (Next[0]) !== 'undefined') { Next[0].click(); }
            break;
        }
      }
    }, false);
  }
  if (app.options("enable_read_hotkeys")) {
    document.addEventListener('keydown', function (e) {
      if (!e.ctrlKey && !e.altKey && !e.shiftKey) {
        switch (e.keyCode) {
          case 37:
            var Prev = ffn$("button:contains('< Prev')");
            if (typeof (Prev[0]) !== 'undefined') { Prev.click(); }
            break;
          case 39:
            var Next = ffn$("button:contains('Next >')");
            if (typeof (Next[0]) !== 'undefined') { Next.click(); }
            break;
        }
      }
    }, false);
  }

  // links on reading page #profile_top when using together with FF Enhancements
  ffn$(".z-list").each(function () {
    var story = new Story({ namespace: app.namespace, instance: this });
    //add story to the collection
    app.collection.push(story);
  });
  ffn$("#profile_top").each(function () {
    var story = new Story({ namespace: app.namespace, instance: this });
    //add story to the collection
    app.collection.push(story);
  });

  // hide/show options
  ffn$('div#content_wrapper_inner').after(pluginActions);
}

function addActionLinksAO3() {
  // adding hotkeys
  if (app.options("enable_read_hotkeys")) {
    document.addEventListener('keydown', function (e) {
      if (!e.ctrlKey && !e.altKey && !e.shiftKey) {
        switch (e.keyCode) {
          case 37:
            var Prev = ffn$("a:contains('←Previous Chapter')");
            if (typeof (Prev[0]) !== 'undefined') { Prev[0].click(); }
            break;
          case 39:
            var Next = ffn$("a:contains('Next Chapter →')");
            if (typeof (Next[0]) !== 'undefined') { Next[0].click(); }
            break;
        }
      }
    }, false);
  }
  // in lists
  ffn$(".blurb").each(function () {
    var story = new Story({ namespace: app.namespace, instance: this });
    app.collection.push(story);
  });
  // on reading page
  ffn$("div.preface.group").each(function () {
    var story = new Story({ namespace: app.namespace, instance: this });
    app.collection.push(story);
  });
  // hide/show options
  ffn$('div.navigation.actions.module, div.primary.header.module').after(pluginActions);
}

// FILE IMPORT/EXPORT
function importFile() {
  var selectedFile = document.getElementById('ffn_import_file_box').files.item(0);
  if (selectedFile === null) return;

  const reader = new FileReader();
  reader.readAsText(selectedFile);

  reader.onload = () => {
    var new_db;
    try {
      new_db = JSON.parse(reader.result);
    } catch (err) {
      alert("JSON data in file is invalid");
      return;
    }
    localStorage.setItem(DB_NAME, JSON.stringify(new_db));
    document.location = document.location;
  };
}

function exportFile() {
  var curdate = new Date();
  var year = curdate.getFullYear();
  var month = curdate.getMonth() + 1;
  month = month < 10 ? "0" + month : month;
  var day = curdate.getDate();
  day = day < 10 ? "0" + day : day;
  writeFile(JSON.stringify(db, null, " "), "FFN_" + window.location.host + "_" + year + "-" + month + "-" + day + ".txt", "text/plain");
  return false;
}

function writeFile(content, fileName, mime) {
  const blob = new Blob([content], {
    type: mime
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.style = "display: none";
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(function () {
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }, 100);
}

function updateOption(option, value) {
  app.options(option, value);
  return false;
}

function dislike_all() {
  ffn$("div.z-list:visible").each(function () {
    var story = new Story({
      namespace: app.namespace,
      instance: this
    });
    app.collection.push(story);
    app.author.dislike(story.authorId());
  });
}

//START 
var app = new Application({ namespace: document.location.host, db: db });

// Adding action links and navigation shortcuts to pages
switch (window.location.hostname) {
  case "www.fanfiction.net":
    addActionLinksFFnet();
    break;
  case "archiveofourown.org":
    addActionLinksAO3();
    break;
}

//	OPTIONS
//	-  show/hide global options
//
if (app.options("hide_likes")) {
  ffn$('.liker_script_options').append('<a href="" class="show_likes" style="color:blue">Show Liked (Fics)</a>');
  ffn$('.liker_script_options .show_likes').click(function () { updateOption(appOptions.hideLikes, false); });
} else {
  ffn$('.liker_script_options').append('<a href="" class="hide_likes" style="color:blue">Hide Liked (Fics)</a>');
  ffn$('.liker_script_options .hide_likes').click(function () { updateOption(appOptions.hideLikes, true); });
}
ffn$('.liker_script_options').append('| ');

if (app.options("hide_marked")) {
  ffn$('.liker_script_options').append('<a href="" class="show_marked" style="color:blue">Show Marked (Fics)</a>');
  ffn$('.liker_script_options .show_marked').click(function () { updateOption(appOptions.hideMarked, false); });
} else {
  ffn$('.liker_script_options').append('<a href="" class="hide_marked" style="color:blue">Hide Marked (Fics)</a>');
  ffn$('.liker_script_options .hide_marked').click(function () { updateOption(appOptions.hideMarked, true); });
}
ffn$('.liker_script_options').append('| ');

if (app.options("hide_dislikes")) {
  ffn$('.liker_script_options').append('<a href="" class="show_dislikes" style="color:blue">Show Disliked (all)</a>');
  ffn$('.liker_script_options .show_dislikes').click(function () { updateOption(appOptions.hideDislikes, false); });
} else {
  ffn$('.liker_script_options').append('<a href="" class="hide_dislikes" style="color:blue">Hide Disliked (all)</a>');
  ffn$('.liker_script_options .hide_dislikes').click(function () { updateOption(appOptions.hideDislikes, true); });
}
ffn$('.liker_script_options').append('| ');

if (app.options("hide_ignored")) {
  ffn$('.liker_script_options').append('<a href="" class="show_ignored" style="color:blue">Show Ignored</a>');
  ffn$('.liker_script_options .show_ignored').click(function () { updateOption(appOptions.hideIgnored, false); });
} else {
  ffn$('.liker_script_options').append('<a href="" class="hide_ignored" style="color:blue">Hide Ignored</a>');
  ffn$('.liker_script_options .hide_ignored').click(function () { updateOption(appOptions.hideIgnored, true); });
}
ffn$('.liker_script_options').append('| ');

if (app.options("hide_planned")) {
  ffn$('.liker_script_options').append('<a href="" class="show_planned" style="color:blue">Show Planned</a>');
  ffn$('.liker_script_options .show_planned').click(function () { updateOption(appOptions.hidePlanned, false); });
} else {
  ffn$('.liker_script_options').append('<a href="" class="hide_planned" style="color:blue">Hide Planned</a>');
  ffn$('.liker_script_options .hide_planned').click(function () { updateOption(appOptions.hidePlanned, true); });
}

// specific links for sites

ffn$('.liker_script_options').append('| <a href="" id="ffn_OptionsToggle" style="color:blue">FFN Options</a>');
ffn$('.liker_script_options').after(
  "<div id='ffn_options_block' style='display:none;'>" +
  "<input type='checkbox' id='ffn_checkbox_hide_likes'> Hide Likes (fics only, not authors)</br>" +
  "<input type='checkbox' id='ffn_checkbox_hide_marked'> Hide Read</br>" +
  "<input type='checkbox' id='ffn_checkbox_hide_dislikes'> Hide Dislikes (both fics and authors)</br>" +
  "<input type='checkbox' id='ffn_checkbox_hide_ignored'> Hide Ignored</br>" +
  "<input type='checkbox' id='ffn_checkbox_hide_planned'> Hide Planned</br>" +
  "</br>" +
  "<input type='checkbox' id='ffn_checkbox_enable_read_hotkeys'> Enable hotkeys on reading pages (Left/Right for next/prev chapter)</br>" +
  "</br>" +
  "<button id='ffn_options_button_save'>Save options and reload page</button></br>" +
  "</br>" +
  "</br>" +
  "Export data: <button id='ffn_export_to_file'>Download text file</button></br>" +
  "Import data: <input id='ffn_import_file_box' type='file' accept='text/plain'>" + "<button id='ffn_import_file_button'>Import</button>" +
  "</div>"
);

// import/export db data
ffn$('#ffn_import_file_button').click(importFile);
ffn$('#ffn_export_to_file').click(exportFile);

ffn$('#ffn_OptionsToggle').click(function () {
  ffn$("#ffn_options_block").toggle();
  ffn$("#ffn_checkbox_hide_likes").prop("checked", app.options("hide_likes"));
  ffn$("#ffn_checkbox_hide_marked").prop("checked", app.options("hide_marked"));
  ffn$("#ffn_checkbox_hide_dislikes").prop("checked", app.options("hide_dislikes"));
  ffn$("#ffn_checkbox_hide_ignored").prop("checked", app.options("hide_ignored"));
  ffn$("#ffn_checkbox_hide_planned").prop("checked", app.options("hide_planned"));
  ffn$("#ffn_checkbox_enable_list_hotkeys").prop("checked", app.options("enable_list_hotkeys"));
  ffn$("#ffn_checkbox_enable_read_hotkeys").prop("checked", app.options("enable_read_hotkeys"));
  return false;
});

ffn$('#ffn_options_button_save').click(function () {
  app.options("hide_likes", ffn$("#ffn_checkbox_hide_likes").prop("checked"));
  app.options("hide_marked", ffn$("#ffn_checkbox_hide_marked").prop("checked"));
  app.options("hide_dislikes", ffn$("#ffn_checkbox_hide_dislikes").prop("checked"));
  app.options("hide_ignored", ffn$("#ffn_checkbox_hide_ignored").prop("checked"));
  app.options("hide_planned", ffn$("#ffn_checkbox_hide_planned").prop("checked"));
  app.options("enable_list_hotkeys", ffn$("#ffn_checkbox_enable_list_hotkeys").prop("checked"));
  app.options("enable_read_hotkeys", ffn$("#ffn_checkbox_enable_read_hotkeys").prop("checked"));
  location.reload();
  return false;
});
