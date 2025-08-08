const { app, BrowserWindow, ipcMain, BrowserView, Menu } = require('electron')
const path = require('path')

let mainWindow
let titleBarView
let tabs = [] // Array to store all tabs
let activeTabId = 1
let tabIdCounter = 1

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        title: 'Vasudev Browser',
        titleBarStyle: 'hidden',
        frame: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false
        },
        show: false,
        backgroundColor: '#1a1a2e'
    })

    Menu.setApplicationMenu(null)

    // Create title bar view (persistent)
    titleBarView = new BrowserView({
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false
        }
    })

    mainWindow.setBrowserView(titleBarView)
    titleBarView.webContents.loadFile('titlebar.html')

    // Create initial tab
    createNewTab('homepage.html', 'Vasudev Browser', true)

    updateViewBounds()

    mainWindow.on('resize', updateViewBounds)
    mainWindow.on('maximize', updateViewBounds)
    mainWindow.on('unmaximize', updateViewBounds)

    // Show window when title bar is ready
    titleBarView.webContents.once('dom-ready', () => {
        mainWindow.show()
        mainWindow.focus()
        console.log('🚀 Vasudev Browser with tabs started!')
    })

    mainWindow.on('closed', () => {
        mainWindow = null
        tabs = []
    })
}

// Create new tab
function createNewTab(url = 'homepage.html', title = 'New Tab', setActive = false) {
    const tabId = tabIdCounter++
    
    const contentView = new BrowserView({
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true,
            allowRunningInsecureContent: true
        }
    })

    const tab = {
        id: tabId,
        view: contentView,
        url: url,
        title: title,
        loading: false
    }

    tabs.push(tab)

    // Load content
    if (url.startsWith('http://') || url.startsWith('https://')) {
        contentView.webContents.loadURL(url)
    } else {
        contentView.webContents.loadFile(url)
    }

    // Handle navigation events
    contentView.webContents.on('did-navigate', (event, newUrl) => {
        tab.url = newUrl
        if (tab.id === activeTabId) {
            titleBarView.webContents.send('url-updated', newUrl)
            updateNavigationButtons()
        }
        updateTabInTitleBar(tab)
    })

    contentView.webContents.on('page-title-updated', (event, newTitle) => {
        tab.title = newTitle
        if (tab.id === activeTabId) {
            mainWindow.setTitle(`${newTitle} - Vasudev Browser`)
        }
        updateTabInTitleBar(tab)
    })

    contentView.webContents.on('did-start-loading', () => {
        tab.loading = true
        if (tab.id === activeTabId) {
            titleBarView.webContents.send('loading-started')
        }
    })

    contentView.webContents.on('did-stop-loading', () => {
        tab.loading = false
        if (tab.id === activeTabId) {
            titleBarView.webContents.send('loading-stopped')
        }
    })

    // Handle external links in same tab
    contentView.webContents.setWindowOpenHandler(({ url }) => {
        contentView.webContents.loadURL(url)
        return { action: 'deny' }
    })

    // Set as active tab if requested
    if (setActive) {
        switchToTab(tabId)
    }

    // Update tabs in title bar
    updateTabsInTitleBar()

    return tabId
}

// Switch to specific tab
function switchToTab(tabId) {
    const tab = tabs.find(t => t.id === tabId)
    if (!tab) return

    activeTabId = tabId

    // Remove all content views except title bar
    mainWindow.getBrowserViews().forEach(view => {
        if (view !== titleBarView) {
            mainWindow.removeBrowserView(view)
        }
    })

    // Add the active tab's view
    mainWindow.addBrowserView(tab.view)
    
    // Update bounds
    updateViewBounds()

    // Update title bar with current tab info
    titleBarView.webContents.send('url-updated', tab.url)
    titleBarView.webContents.send('title-updated', tab.title)
    updateNavigationButtons()

    // Update window title
    mainWindow.setTitle(`${tab.title} - Vasudev Browser`)

    // Update tab highlighting in title bar
    titleBarView.webContents.send('active-tab-changed', tabId)
}

// Close tab
function closeTab(tabId) {
    const tabIndex = tabs.findIndex(t => t.id === tabId)
    if (tabIndex === -1) return

    const tab = tabs[tabIndex]
    
    // Remove view
    mainWindow.removeBrowserView(tab.view)
    tab.view.webContents.destroy()

    // Remove from tabs array
    tabs.splice(tabIndex, 1)

    // If this was the active tab, switch to another
    if (tabId === activeTabId) {
        if (tabs.length > 0) {
            // Switch to next tab or previous if this was the last
            const nextTab = tabs[Math.min(tabIndex, tabs.length - 1)]
            switchToTab(nextTab.id)
        } else {
            // No tabs left, close window
            mainWindow.close()
            return
        }
    }

    // Update tabs in title bar
    updateTabsInTitleBar()
}

// Update view bounds
function updateViewBounds() {
    if (!mainWindow || !titleBarView) return
    
    const bounds = mainWindow.getBounds()
    const titleBarHeight = 88 // Title bar + tab bar

    titleBarView.setBounds({ 
        x: 0, 
        y: 0, 
        width: bounds.width, 
        height: titleBarHeight 
    })

    // Update active tab content view
    const activeTab = tabs.find(t => t.id === activeTabId)
    if (activeTab) {
        activeTab.view.setBounds({ 
            x: 0, 
            y: titleBarHeight, 
            width: bounds.width, 
            height: bounds.height - titleBarHeight 
        })
    }
}

// Update navigation buttons
function updateNavigationButtons() {
    const activeTab = tabs.find(t => t.id === activeTabId)
    if (!activeTab) return

    const canGoBack = activeTab.view.webContents.canGoBack()
    const canGoForward = activeTab.view.webContents.canGoForward()
    
    titleBarView.webContents.send('navigation-updated', {
        canGoBack,
        canGoForward
    })
}

// Update tabs list in title bar
function updateTabsInTitleBar() {
    const tabsData = tabs.map(tab => ({
        id: tab.id,
        title: tab.title,
        url: tab.url,
        loading: tab.loading,
        active: tab.id === activeTabId
    }))
    
    titleBarView.webContents.send('tabs-updated', tabsData)
}

// Update single tab in title bar
function updateTabInTitleBar(tab) {
    titleBarView.webContents.send('tab-updated', {
        id: tab.id,
        title: tab.title,
        url: tab.url,
        loading: tab.loading,
        active: tab.id === activeTabId
    })
}

// IPC Handlers
ipcMain.on('window-close', () => {
    if (mainWindow) mainWindow.close()
})

ipcMain.on('window-minimize', () => {
    if (mainWindow) mainWindow.minimize()
})

ipcMain.on('window-maximize', () => {
    if (mainWindow) {
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize()
        } else {
            mainWindow.maximize()
        }
    }
})

ipcMain.on('navigate-back', () => {
    const activeTab = tabs.find(t => t.id === activeTabId)
    if (activeTab && activeTab.view.webContents.canGoBack()) {
        activeTab.view.webContents.goBack()
    }
})

ipcMain.on('navigate-forward', () => {
    const activeTab = tabs.find(t => t.id === activeTabId)
    if (activeTab && activeTab.view.webContents.canGoForward()) {
        activeTab.view.webContents.goForward()
    }
})

ipcMain.on('navigate-refresh', () => {
    const activeTab = tabs.find(t => t.id === activeTabId)
    if (activeTab) {
        activeTab.view.webContents.reload()
    }
})

ipcMain.on('navigate-home', () => {
    const activeTab = tabs.find(t => t.id === activeTabId)
    if (activeTab) {
        activeTab.view.webContents.loadFile('homepage.html')
    }
})

ipcMain.on('navigate-to', (event, url) => {
    const activeTab = tabs.find(t => t.id === activeTabId)
    if (!activeTab) return
    
    let finalUrl = url.trim()
    
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://') && !finalUrl.startsWith('file://')) {
        if (finalUrl.includes('.') && !finalUrl.includes(' ') && finalUrl.length > 3) {
            finalUrl = 'https://' + finalUrl
        } else {
            finalUrl = 'https://www.google.com/search?q=' + encodeURIComponent(finalUrl)
        }
    }
    
    activeTab.view.webContents.loadURL(finalUrl)
        .catch(error => {
            console.error('Navigation error:', error)
            const searchUrl = 'https://www.google.com/search?q=' + encodeURIComponent(url)
            activeTab.view.webContents.loadURL(searchUrl)
        })
})

// Tab management IPC handlers
ipcMain.on('new-tab', (event, url) => {
    const newTabId = createNewTab(url || 'homepage.html', 'New Tab', true)
    console.log('New tab created:', newTabId)
})

ipcMain.on('close-tab', (event, tabId) => {
    closeTab(tabId)
})

ipcMain.on('switch-tab', (event, tabId) => {
    switchToTab(tabId)
})

// App events
app.whenReady().then(() => {
    createWindow()
    console.log('🚀 Vasudev Browser with tab system started!')
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

console.log('📦 Vasudev Browser Main Process with Tabs Loaded!')
    