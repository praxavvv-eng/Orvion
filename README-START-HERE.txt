ORVION — START HERE

1. Extract this ZIP.
2. In VS Code choose File > Open Folder and select "Orvion-main".
3. Right-click index.html > "Open with Live Server" (or any local HTTP server).
   Do NOT double-click index.html (file://): ES modules and the service worker need http(s).
4. Test: Home, Discover, Search, Watchlist (open a "Watching" title -> episode tracker), Stats, Appearance (top-right).

Before pushing to GitHub/Vercel:
- Back up the currently deployed project and preserve your .git folder.
- Check the live TMDB key and Firestore reads/writes with your real data.
- Read UPDATE-NOTES.txt ("DATA SAFETY") - especially the note about Firestore security rules.

The package contains no private Firebase rules and no backend proxy. Never make Firestore publicly writable as a workaround.
