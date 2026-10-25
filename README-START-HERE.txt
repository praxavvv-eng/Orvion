ORVION — START HERE

1. Extract this ZIP.
2. In VS Code choose File > Open Folder.
3. Select the extracted folder named "Orvion-main".
4. Install/use the VS Code Live Server extension (or another local HTTP server).
5. Right-click index.html and choose "Open with Live Server".
6. Test Home, Discover, Search, Details, and Watchlist.

Do not double-click index.html to open it using file://. ES modules and the service worker need an HTTP(S) origin.

Before pushing to GitHub/Vercel:
- Keep a backup of the currently deployed project.
- If copying into an existing Git repository, preserve the hidden .git folder.
- Confirm that Home and Discover load with your actual TMDB key and network.
- Confirm that Watchlist reads and writes still work with your live Firestore security rules.

The package does not include private Firebase security rules or a backend proxy. Do not make Firestore publicly writable as a workaround for an API or UI issue.
