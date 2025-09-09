import { useState } from "react";
import { 
  Menu, 
  Search, 
  Mic, 
  Settings, 
  History, 
  Download, 
  Star, 
  User, 
  HelpCircle,
  X,
  Plus,
  Globe,
  Clock,
  BookOpen,
  Gamepad2
} from "lucide-react";

export default function MainPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const shortcuts = [
    { name: "YouTube", icon: "", color: "bg-red-100" },
    { name: "Gmail", icon: "", color: "bg-blue-100" },
    { name: "Drive", icon: "", color: "bg-green-100" },
    { name: "Maps", icon: "", color: "bg-yellow-100" },
    { name: "News", icon: "", color: "bg-purple-100" },
    { name: "Photos", icon: "", color: "bg-pink-100" },
    { name: "Calendar", icon: "", color: "bg-indigo-100" },
    { name: "Translate", icon: "", color: "bg-cyan-100" }
  ];

  const sidebarItems = [
    { icon: History, label: "History", shortcut: "Ctrl+H" },
    { icon: Download, label: "Downloads", shortcut: "Ctrl+J" },
    { icon: Star, label: "Bookmarks", shortcut: "Ctrl+Shift+O" },
    { icon: Settings, label: "Settings" },
    { icon: User, label: "Profile" },
    { icon: HelpCircle, label: "Help & Support" }
  ];

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      // Simulate search functionality
      console.log("Searching for:", searchQuery);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl animate-pulse"></div>
      </div>

      {/* Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity duration-300"
          onClick={() => setSidebarOpen(false)}
        ></div>
      )}

      {/* Sidebar */}
      <div className={`fixed left-0 top-0 h-full w-80 bg-slate-800/95 backdrop-blur-xl border-r border-slate-700/50 z-50 transform transition-transform duration-300 ease-out ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="flex items-center justify-between p-6 border-b border-slate-700/50">
          <h2 className="text-xl font-semibold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            Vasudev Browser
          </h2>
          <button 
            onClick={() => setSidebarOpen(false)}
            className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        
        <nav className="p-4 space-y-2">
          {sidebarItems.map((item, index) => (
            <button
              key={index}
              className="w-full flex items-center justify-between p-3 hover:bg-slate-700/50 rounded-lg transition-all duration-200 group"
            >
              <div className="flex items-center space-x-3">
                <item.icon size={20} className="text-slate-400 group-hover:text-white transition-colors" />
                <span className="text-slate-300 group-hover:text-white transition-colors">{item.label}</span>
              </div>
              {item.shortcut && (
                <span className="text-xs text-slate-500 bg-slate-700/50 px-2 py-1 rounded">
                  {item.shortcut}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="absolute bottom-6 left-6 right-6">
          <div className="bg-slate-700/30 rounded-lg p-4 border border-slate-600/30">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
                <User size={20} />
              </div>
              <div>
                <p className="font-medium">Welcome back!</p>
                <p className="text-sm text-slate-400">vasudev@browser.com</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10">
        {/* Header */}
        <header className="flex items-center justify-between p-6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-3 hover:bg-slate-700/30 rounded-lg transition-all duration-200 hover:scale-105"
          >
            <Menu size={24} />
          </button>
          
          <div className="flex items-center space-x-4">
            <button className="p-2 hover:bg-slate-700/30 rounded-lg transition-colors">
              <Settings size={20} />
            </button>
            <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
              <User size={16} />
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex flex-col items-center justify-center min-h-[calc(100vh-120px)] px-6">
          {/* Logo */}
          <div className="mb-12">
            <h1 className="text-7xl font-light tracking-tight bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent hover:scale-105 transition-transform duration-300 cursor-default">
              Vasudev
            </h1>
          </div>

          {/* Search Bar */}
          <div className="w-full max-w-2xl mb-12">
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              <div className="relative flex items-center bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-full px-6 py-4 hover:bg-slate-800/70 hover:border-slate-600/50 transition-all duration-300">
                <Search size={20} className="text-slate-400 mr-4" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch(e)}
                  placeholder="Search Google or type a URL"
                  className="flex-1 bg-transparent outline-none text-white placeholder-slate-400"
                />
                <button onClick={handleSearch} className="ml-4 p-2 hover:bg-slate-700/50 rounded-full transition-colors">
                  <Mic size={16} className="text-slate-400 hover:text-white transition-colors" />
                </button>
              </div>
            </div>
          </div>

          {/* Shortcuts Grid */}
          <div className="grid grid-cols-4 gap-6 max-w-2xl w-full">
            {shortcuts.map((shortcut, index) => (
              <button
                key={index}
                className="group flex flex-col items-center p-6 hover:bg-slate-800/30 rounded-2xl transition-all duration-300 hover:scale-105"
              >
                <div className={`w-16 h-16 ${shortcut.color} rounded-2xl flex items-center justify-center text-2xl mb-3 group-hover:scale-110 transition-transform duration-300 shadow-lg`}>
                  {shortcut.icon}
                </div>
                <span className="text-sm text-slate-300 group-hover:text-white transition-colors">
                  {shortcut.name}
                </span>
              </button>
            ))}
          </div>

          {/* Add Shortcut Button */}
          <button className="mt-8 flex items-center space-x-2 px-6 py-3 bg-slate-800/30 hover:bg-slate-800/50 rounded-full border border-slate-700/50 hover:border-slate-600/50 transition-all duration-300 group">
            <Plus size={16} className="text-slate-400 group-hover:text-white transition-colors" />
            <span className="text-slate-400 group-hover:text-white transition-colors">Add shortcut</span>
          </button>
        </main>
      </div>
    </div>
  );
}