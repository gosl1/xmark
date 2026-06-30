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
label.style.color = "rgb(255, 255, 255)"; // Matches X's text/icon white color
label.style.transition = "transform 0.1s ease";

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


// 1. Core Worker Function
function insertFolderIcon(tweetBox) {
    // Look for the native bookmark button inside this specific box context
    const nativeButton = tweetBox.querySelector('[data-testid="bookmark"], [data-testid="removeBookmark"]');
    if (!nativeButton){
       return
    } // Exit silently if it hasn't populated yet

    const myReferenceNode = nativeButton.parentNode;
    const myParentNode = tweetBox.querySelector('[role="group"]');
    const containerClone = label.cloneNode(true);
    containerClone.addEventListener("click", (event) => {
        containerClone.textContent = "pibble";
    })

    // Safe relational insertion mapping
    myParentNode.insertBefore(containerClone, myReferenceNode);
    console.log("🌟 Custom icon successfully mounted adjacent to bookmark element!");
}
// Keep your exact insertFolderIcon function up here...

// This is the clean function you hand to the MutationObserver
const yorObserverCallback = (mutationList) => {
    // 1. Loop through every single layout change the browser caught
    for (const mutation of mutationList) {
        
        // 2. Look only at the HTML elements that were JUST added to the screen
        for (const node of mutation.addedNodes) {
            
            // 3. Is this added node a tweet container?
            if (node instanceof Element && node.matches('[data-testid="cellInnerDiv"]')) {
                
                // 4. Run your folder insertion code ONLY on this specific new tweet!
                tweetDelay(node); 
            }
        }
    }
};

// Wait exactly 50ms after the page loads before looking for the tweet
function tweetDelay(tweet){
setTimeout(() => {
    insertFolderIcon(tweet)
}, 50);
}


// Now you hand this specific, data-reading function to the guard
const observer = new MutationObserver(yorObserverCallback);
observer.observe(document.body, { childList: true, subtree: true });
