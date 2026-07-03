// 1. Create your secure folder button
const label = document.createElement("button");
label.className = "my-custom-folder-icon"; // Your crucial loop shield
label.style.display = "flex";
label.style.alignItems = "center";
label.style.justifyContent = "center";
label.style.background = "none";
label.style.border = "none";
label.style.cursor = "pointer";
label.style.padding = "0 8px";
label.style.margin = "0";
label.style.color = "rgb(113, 118, 123)"; // Matches X's text/icon white color
label.style.transition = "transform 0.9s ease";

// 2. Build the standard 24x24 single Folder SVG
const folderSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
folderSvg.setAttribute("viewBox", "0 0 24 24");
folderSvg.setAttribute("width", "18"); // Matches native X icon scaling
folderSvg.setAttribute("height", "18");
folderSvg.setAttribute("fill", "currentColor");

// The vector path for a clean, outlined modern folder
const folderPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
folderPath.setAttribute("d", "M20 5h-7.586l-2-2H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 14H4V7h16v12z");

// 3. Assemble the pieces
folderSvg.appendChild(folderPath);
label.appendChild(folderSvg);