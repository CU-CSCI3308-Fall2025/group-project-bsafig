// nearly identical to spotifySearch.js, references new IDs
// for consistency
// IDs match those used in create-status.hbs
const musicInput = document.getElementById('songName'); 
const resultsList = document.getElementById('spotifyResultsStatus');

let debounceTimeout;
let currentQuery = '';
let offset = 0;
let isLoading = false;
let hasMore = true;

async function fetchResults(query, append = false) {
  if (isLoading || !hasMore) return;
  isLoading = true;

  // Added a check to hide the list if query is empty
  if (!query.trim()) {
    resultsList.innerHTML = '';
    isLoading = false;
    return;
  }

  try {
    const res = await fetch(`/spotify-search?q=${encodeURIComponent(query)}&offset=${offset}`);
    const data = await res.json();
    const tracks = data.tracks?.items || [];
    const artists = data.artists?.items || [];
    const albums = data.albums?.items || [];
    const items = [...tracks, ...artists, ...albums];

    if (!append) resultsList.innerHTML = '';
    
    if (items.length === 0) {
      hasMore = false;
      if (!append) { // a "No results" message only if it's a new search
        const li = document.createElement('li');
        li.className = 'list-group-item text-muted';
        li.textContent = 'No results found.';
        resultsList.appendChild(li);
      }
      return;
    }

    items.forEach(item => {
      let name = item.name;
      // Format for display: Song - Artist
      if (item.type === 'track') name += ` - ${item.artists[0].name}`;
      else if (item.type === 'album') name += ` (Album by ${item.artists[0].name})`;
      else if (item.type === 'artist') name += ` (Artist)`;

      const li = document.createElement('li');
      li.className = 'list-group-item list-group-item-action';
      li.textContent = name;
      li.addEventListener('click', () => {
        // Set the input value to the selected song/artist/album
        musicInput.value = name;
        // Clear and hide the results list
        resultsList.innerHTML = '';
      });
      resultsList.appendChild(li);
    });

    offset += items.length;
  } catch (err) {
    console.error('Error fetching Spotify data for status:', err);
  } finally {
    isLoading = false;
  }
}

// On typing
musicInput.addEventListener('input', () => {
  clearTimeout(debounceTimeout);
  const query = musicInput.value.trim();
  
  if (!query) {
    resultsList.innerHTML = '';
    return;
  }

  debounceTimeout = setTimeout(() => {
    currentQuery = query;
    offset = 0;
    hasMore = true;
    fetchResults(currentQuery, false);
  }, 300);
});

// Infinite scroll
resultsList.addEventListener('scroll', () => {
  // Check if the user is near the bottom of the results list
  if (resultsList.scrollTop + resultsList.clientHeight >= resultsList.scrollHeight - 20) {
    fetchResults(currentQuery, true); // Append results
  }
});

// Hide results when clicking outside the input
document.addEventListener('click', (event) => {
  if (event.target !== musicInput && !resultsList.contains(event.target)) {
    resultsList.innerHTML = '';
  }
});