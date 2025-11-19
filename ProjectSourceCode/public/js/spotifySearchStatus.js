const searchInput = document.getElementById('songName'); // The field the user types into
const verifiedInput = document.getElementById('verifiedSelection'); // The HIDDEN field for the server to validate
const resultsList = document.getElementById('spotifyResults');
const submitButton = document.getElementById('submitStatusButton');

let debounceTimeout;
let currentQuery = '';
let offset = 0;
let isLoading = false;
let hasMore = true;

// to enable/disable the submit button and clear the verified selection
function setSelection(name) {
    if (name) {
        verifiedInput.value = name;
        submitButton.disabled = false;
        searchInput.value = name; 
        resultsList.innerHTML = '';
    } else {
        verifiedInput.value = '';
        submitButton.disabled = true;
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
            const li = document.createElement('li');
            li.className = 'list-group-item list-group-item-action';
            li.textContent = name;
            
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
searchInput.addEventListener('input', () => {
    // Clear any previous valid selection when the user starts typing again
    setSelection(null); 
    
    clearTimeout(debounceTimeout);
    const query = searchInput.value.trim();
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


resultsList.addEventListener('scroll', () => {
    if (resultsList.scrollTop + resultsList.clientHeight >= resultsList.scrollHeight - 20) {
        fetchResults(currentQuery, true);
    }
});