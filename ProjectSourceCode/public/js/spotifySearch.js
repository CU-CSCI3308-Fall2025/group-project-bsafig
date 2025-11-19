const musicInput = document.getElementById('musicName'); // id has to be musicName !!
const verifiedInput = document.getElementById('verifiedMusicName'); // 🚨 NEW: Hidden field for verified selection
const resultsList = document.getElementById('spotifyResults');
const submitButton = document.getElementById('postSubmitButton'); // 🚨 NEW: Submit button reference
let debounceTimeout;
let currentQuery = '';
let offset = 0;
let isLoading = false;
let hasMore = true;

// to enable/disable the button
function setSelection(name) {
    if (name) {
        verifiedInput.value = name;
        musicInput.value = name; // Update visible input with clean name
        submitButton.disabled = false;
        resultsList.innerHTML = '';
    } else {
        verifiedInput.value = ''; // Clear the verified field
        submitButton.disabled = true; // Disable the button
    }
}

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

      // Get image
      let imageUrl = '';
      if (item.album?.images?.length) {
        imageUrl = item.album.images[0].url;        // tracks
      } else if (item.images?.length) {
        imageUrl = item.images[0].url;              // artists/albums
      }

      const li = document.createElement('li');
      li.className = 'list-group-item list-group-item-action d-flex align-items-center';

      li.innerHTML = `
        <img src="${imageUrl}" class="result-img">
        <span>${name}</span>
      `;

      li.addEventListener('click', () => {
        musicInput.value = name;

        resultsList.innerHTML = '';
      });

      // call the selection function to allow submit
      li.addEventListener('click', () => {
        setSelection(name);
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
  // clear the selection ability the moment it's typed
  setSelection(null);

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

