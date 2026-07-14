(function () {
  function loadLocalImages(root) {
    var scope = root || document;
    var nodes = scope.querySelectorAll("img[data-src], source[data-srcset]");

    for (var i = 0; i < nodes.length; i += 1) {
      var node = nodes[i];
      var src = node.getAttribute("data-src");
      var srcset = node.getAttribute("data-srcset");

      if (src && !node.getAttribute("src")) {
        node.setAttribute("src", src);
      }

      if (srcset && !node.getAttribute("srcset")) {
        node.setAttribute("srcset", srcset);
      }

      if (node.classList) {
        node.classList.remove("lazyload");
        node.classList.add("lazyloaded");
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      loadLocalImages(document);
    });
  } else {
    loadLocalImages(document);
  }

  window.addEventListener("load", function () {
    loadLocalImages(document);
  });

  window.REIMU_LOAD_LOCAL_IMAGES = loadLocalImages;
})();
