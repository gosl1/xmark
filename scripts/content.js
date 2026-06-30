
const label = document.createElement("button");
label.textContent = "pib";
label.style.color = "rgb(255, 255, 255)";
label.style.margin = "0";
label.style.fontSize = "14px";
label.style.cursor = "pointer";


// 1. Core Worker Function
function insertFolderIcon(tweetBox) {
    // Look for the native bookmark button inside this specific box context
    const nativeButton = tweetBox.querySelector('[data-testid="bookmark"]');
    if (!nativeButton) return; // Exit silently if it hasn't populated yet

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
