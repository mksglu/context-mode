"use strict";Object.defineProperty(exports,"__esModule",{value:!0});var u=/highlight-(?:text|source)-([a-z0-9]+)/;function s(e){e.addRule("highlightedCodeBlock",{filter:function(t){var r=t.firstChild;return t.nodeName==="DIV"&&u.test(t.className)&&r&&r.nodeName==="PRE"},replacement:function(t,r,n){var i=r.className||"",l=(i.match(u)||[null,""])[1];return`

`+n.fence+l+`
`+r.firstChild.textContent+`
`+n.fence+`

`}})}function f(e){e.addRule("strikethrough",{filter:["del","s","strike"],replacement:function(t){return"~"+t+"~"}})}var m=Array.prototype.indexOf,p=Array.prototype.every,a={};a.tableCell={filter:["th","td"],replacement:function(e,t){return d(e,t)}};a.tableRow={filter:"tr",replacement:function(e,t){var r="",n={left:":--",right:"--:",center:":-:"};if(o(t))for(var i=0;i<t.childNodes.length;i++){var l="---",c=(t.childNodes[i].getAttribute("align")||"").toLowerCase();c&&(l=n[c]||l),r+=d(l,t.childNodes[i])}return`
`+e+(r?`
`+r:"")}};a.table={filter:function(e){return e.nodeName==="TABLE"&&o(e.rows[0])},replacement:function(e){return e=e.replace(`

`,`
`),`

`+e+`

`}};a.tableSection={filter:["thead","tbody","tfoot"],replacement:function(e){return e}};function o(e){var t=e.parentNode;return t.nodeName==="THEAD"||t.firstChild===e&&(t.nodeName==="TABLE"||N(t))&&p.call(e.childNodes,function(r){return r.nodeName==="TH"})}function N(e){var t=e.previousSibling;return e.nodeName==="TBODY"&&(!t||t.nodeName==="THEAD"&&/^\s*$/i.test(t.textContent))}function d(e,t){var r=m.call(t.parentNode.childNodes,t),n=" ";return r===0&&(n="| "),n+e+" |"}function h(e){e.keep(function(r){return r.nodeName==="TABLE"&&!o(r.rows[0])});for(var t in a)e.addRule(t,a[t])}function g(e){e.addRule("taskListItems",{filter:function(t){return t.type==="checkbox"&&t.parentNode.nodeName==="LI"},replacement:function(t,r){return(r.checked?"[x]":"[ ]")+" "}})}function v(e){e.use([s,f,h,g])}exports.gfm=v;exports.highlightedCodeBlock=s;exports.strikethrough=f;exports.tables=h;exports.taskListItems=g;
