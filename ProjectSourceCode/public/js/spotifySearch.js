const musicInput = document.getElementById('musicName'); // id has to be musicName !!
const resultsList = document.getElementById('spotifyResults');
let debounceTimeout;
let currentQuery = '';
let offset = 0;
let isLoading = false;
let hasMore = true;

async function fetchResults(query, append = false) {
  if (isLoading || !hasMore) return;
  isLoading = true;

  try {
    const res = await fetch(`/spotify-search?q=${encodeURIComponent(query)}&offset=${offset}`);
    const data = await res.json();
    const tracks = data.tracks?.items || [];
    const artists = data.artists?.items || [];
    const albums = data.albums?.items || [];
    const items = [...tracks, ...artists, ...albums];

    if (items.length === 0) {
      hasMore = false;
      return;
    }

    if (!append) resultsList.innerHTML = '';

    items.forEach(item => {
      let name = item.name;
      if (item.type === 'track') name += ` - ${item.artists[0].name}`;
      const li = document.createElement('li');
      li.className = 'list-group-item list-group-item-action';
      li.textContent = name;
      li.addEventListener('click', () => {
        musicInput.value = name;
        resultsList.innerHTML = '';
      });
      resultsList.appendChild(li);
    });

    offset += items.length;
  } catch (err) {
    console.error('Error fetching Spotify data:', err);
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
  if (resultsList.scrollTop + resultsList.clientHeight >= resultsList.scrollHeight - 20) {
    fetchResults(currentQuery, true);
  }
});

// TODO: when user clicks outside of search bar, clear search bar