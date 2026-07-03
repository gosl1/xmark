// Function that outputs a perfectly styled, un-mounted Flexbox panel
function createFolderPopup() {
    const outerPanel = document.createElement("div");
    outerPanel.className = "xmark-popup-panel";
    
    // Changing the default block layout into a calculative Flexbox Context
    Object.assign(outerPanel.style, {
        position: "fixed", // Keeps it absolute to the glass of the viewport
        display: "none",   // Hidden until a user clicks a folder icon
        flexDirection: "column",
        zIndex: "99999",   // Forces it to float above X's timeline stack
        width: "220px",
        maxHeight: "300px",
        backgroundColor: "#15202b", // X Dark-mode blue-gray tint
        border: "1px solid #38444d",
        borderRadius: "12px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.5)"
    });

    // Structure our Pinned Header and our Fluid Scroll Box
    outerPanel.innerHTML = `
        <div class="xmark-header" style="flex-shrink: 0; padding: 10px; border-bottom: 1px solid #38444d; display: flex; justify-content: space-between; align-items: center;">
            <span style="color: #fff; font-weight: bold; font-size: 14px;">My Folders</span>
            <button id="xmark-add-btn" style="background: #1d9bf0; color: white; border: none; border-radius: 50%; width: 24px; height: 24px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center;">+</button>
        </div>
        <div id="xmark-scrollbox" style="flex-grow: 1; overflow-y: auto; overscroll-behavior: contain; padding: 10px;">
            </div>
    `;

    return outerPanel;
}

// Instantiate it globally so other files can see it
const folderPopupInstance = createFolderPopup();