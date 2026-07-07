


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
        // 1. Prevent X from opening the tweet page when you click your button
        event.stopPropagation(); 

        // 2. Ensure the box is actually attached to X's webpage document
        if (!document.body.contains(folderPopupInstance)) {
            document.body.appendChild(folderPopupInstance);
        }

        // 3. Extract the coordinates from the MouseEvent interface
        const mouseX = event.clientX;
        const mouseY = event.clientY;

        // 4. Update the CSSOM properties via the HTMLElement.style interface
        folderPopupInstance.style.left = `${mouseX}px`;
        folderPopupInstance.style.top = `${mouseY}px`;
        
        // 5. Turn the layout engine ON by changing display from 'none' to 'flex'
        folderPopupInstance.style.display = "flex";
    });
    // Safe relational insertion mapping
    myParentNode.insertBefore(containerClone, myReferenceNode);
    console.log("🌟 Custom icon successfully mounted adjacent to bookmark element!");
    const addBtn = folderPopupInstance.querySelector("button");
    addBtn.addEventListener("click", (event) => {
        console.log("add button clicked");
    })
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

// So the folder exists once pressed
document.addEventListener("click", event => {
    const isClickInside = folderPopupInstance.contains(event.target);

    if (!isClickInside){
        folderPopupInstance.style.display = "none";
    }

})
