const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());

// Serve anime data as ZIP file (for FlixVision compatibility)
app.get('/series.zip', async (req, res) => {
    try {
        console.log('Scraping live data from 9animetv.to and creating ZIP...');
        
        // Scrape live data
        const response = await axios.get('https://9animetv.to/recently-updated', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            timeout: 15000
        });

        const $ = cheerio.load(response.data);
        const animeList = [];

        // Find anime items in the HTML structure - REMOVED LIMIT
        $('.flw-item').each((index, element) => {
            const $element = $(element);
            
            // Extract anime title
            const titleElement = $element.find('.film-name a');
            const title = titleElement.attr('title') || titleElement.text().trim();
            
            // Extract anime URL
            const relativeUrl = titleElement.attr('href');
            const url = relativeUrl ? `https://9animetv.to${relativeUrl}` : '';
            
            // Extract image URL
            const imgElement = $element.find('.film-poster img');
            const img_url = imgElement.attr('data-src') || imgElement.attr('src') || '';
            
            // Extract episodes info for year approximation
            const episodeInfo = $element.find('.fdi-item').text().trim();
            const currentYear = new Date().getFullYear();
            const title_with_year = `${title} (${currentYear})`;
            
            // Default values
            const genres = 'Action, Adventure, Anime';
            const plot = `Watch ${title} online for free. Latest episodes available on 9anime.`;

            if (title && url) {
                animeList.push({
                    url: url,
                    title_with_year: title_with_year,
                    genres: genres,
                    img_url: img_url,
                    plot: plot
                });
            }
        });

        console.log(`Scraped ${animeList.length} anime items from 9anime`);
        
        if (animeList.length === 0) {
            // Fallback to static data if scraping fails
            const fallbackData = JSON.parse(fs.readFileSync(path.join(__dirname, 'anime.json'), 'utf8'));
            animeList.push(...fallbackData);
            console.log('Using fallback data');
        }
        
        // Create JSON content
        const jsonContent = JSON.stringify(animeList, null, 2);
        
        // Create ZIP file in memory using archiver
        const archiver = require('archiver');
        const archive = archiver('zip', { zlib: { level: 9 } });
        
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', 'attachment; filename="series.zip"');
        
        // Pipe archive to response
        archive.pipe(res);
        
        // Add the JSON file to archive with name that doesn't contain "MA"
        archive.append(jsonContent, { name: 'series.json' });
        
        // Finalize the archive
        archive.finalize();
        
        console.log('Live anime ZIP served successfully');
        
    } catch (error) {
        console.error('Error scraping 9anime:', error.message);
        
        // Fallback to static data
        try {
            const fallbackData = fs.readFileSync(path.join(__dirname, 'anime.json'), 'utf8');
            
            // Create ZIP with fallback data
            const archiver = require('archiver');
            const archive = archiver('zip', { zlib: { level: 9 } });
            
            res.setHeader('Content-Type', 'application/zip');
            res.setHeader('Content-Disposition', 'attachment; filename="series.zip"');
            
            archive.pipe(res);
            archive.append(fallbackData, { name: 'series.json' });
            archive.finalize();
            
            console.log('Served fallback anime ZIP data');
        } catch (fallbackError) {
            res.status(500).json({ 
                error: 'Failed to fetch anime data',
                message: error.message 
            });
        }
    }
});

// Serve static anime JSON data (working endpoint for FlixVision)
app.get('/anime.json', (req, res) => {
    try {
        const animeData = fs.readFileSync(path.join(__dirname, 'anime.json'), 'utf8');
        res.setHeader('Content-Type', 'application/json');
        res.send(animeData);
        console.log('Served anime.json successfully');
    } catch (error) {
        console.error('Error serving anime.json:', error);
        res.status(500).json({ error: 'Failed to load anime data' });
    }
});

// Scrape 9anime and convert to the JSON format FlixVision expects
app.get('/anime/recently-updated', async (req, res) => {
    try {
        console.log('Fetching data from 9animetv.to...');
        
        const response = await axios.get('https://9animetv.to/recently-updated', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            timeout: 10000
        });

        console.log('Response received, parsing HTML...');
        const $ = cheerio.load(response.data);
        const animeList = [];

        // Find anime items in the HTML structure
        $('.film-detail').each((index, element) => {
            const $element = $(element);
            
            // Extract anime title
            const titleElement = $element.find('.film-name a');
            const title = titleElement.attr('title') || titleElement.text().trim();
            
            // Extract anime URL (relative to 9animetv.to)
            const relativeUrl = titleElement.attr('href');
            const url = relativeUrl ? `https://9animetv.to${relativeUrl}` : '';
            
            // Extract image URL from the parent container
            const $parent = $element.parent();
            const imgElement = $parent.find('.film-poster-img');
            const img_url = imgElement.attr('data-src') || imgElement.attr('src') || '';
            
            // For anime, we'll use the title as both title and year info
            const title_with_year = title;
            
            // Default values for missing fields
            const genres = 'Anime'; // Default genre since it's an anime site
            const plot = `Watch ${title} online for free on 9anime`;

            if (title && url) {
                animeList.push({
                    url: url,
                    title_with_year: title_with_year,
                    genres: genres,
                    img_url: img_url,
                    plot: plot
                });
            }
        });

        console.log(`Found ${animeList.length} anime items`);
        
        // Return in the format FlixVision expects
        res.json(animeList);
        
    } catch (error) {
        console.error('Error scraping 9anime:', error.message);
        res.status(500).json({ 
            error: 'Failed to fetch anime data',
            message: error.message 
        });
    }
});

// COMPREHENSIVE SCRAPING ENDPOINT - Scrapes multiple pages and endpoints
app.get('/anime/comprehensive', async (req, res) => {
    try {
        console.log('Starting comprehensive scrape of 9animetv.to...');
        const allAnime = [];
        const scrapedUrls = new Set(); // Prevent duplicates
        
        // Multiple endpoints to scrape
        const endpoints = [
            'https://9animetv.to/recently-updated',
            'https://9animetv.to/recently-updated?page=2',
            'https://9animetv.to/recently-updated?page=3',
            'https://9animetv.to/recently-updated?page=4',
            'https://9animetv.to/recently-updated?page=5',
            'https://9animetv.to/popular',
            'https://9animetv.to/popular?page=2',
            'https://9animetv.to/popular?page=3',
            'https://9animetv.to/trending',
            'https://9animetv.to/trending?page=2',
            'https://9animetv.to/latest',
            'https://9animetv.to/latest?page=2'
        ];

        for (const endpoint of endpoints) {
            try {
                console.log(`Scraping: ${endpoint}`);
                
                const response = await axios.get(endpoint, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    },
                    timeout: 15000
                });

                const $ = cheerio.load(response.data);
                let pageCount = 0;

                // Find anime items in the HTML structure - NO LIMIT
                $('.flw-item').each((index, element) => {
                    const $element = $(element);
                    
                    // Extract anime title
                    const titleElement = $element.find('.film-name a');
                    const title = titleElement.attr('title') || titleElement.text().trim();
                    
                    // Extract anime URL
                    const relativeUrl = titleElement.attr('href');
                    const url = relativeUrl ? `https://9animetv.to${relativeUrl}` : '';
                    
                    // Skip if we've already scraped this anime
                    if (scrapedUrls.has(url)) {
                        return;
                    }
                    
                    // Extract image URL
                    const imgElement = $element.find('.film-poster img');
                    const img_url = imgElement.attr('data-src') || imgElement.attr('src') || '';
                    
                    // Extract episodes info for year approximation
                    const episodeInfo = $element.find('.fdi-item').text().trim();
                    const currentYear = new Date().getFullYear();
                    const title_with_year = `${title} (${currentYear})`;
                    
                    // Default values
                    const genres = 'Action, Adventure, Anime';
                    const plot = `Watch ${title} online for free. Latest episodes available on 9anime.`;

                    if (title && url) {
                        allAnime.push({
                            url: url,
                            title_with_year: title_with_year,
                            genres: genres,
                            img_url: img_url,
                            plot: plot
                        });
                        scrapedUrls.add(url);
                        pageCount++;
                    }
                });
                
                console.log(`Found ${pageCount} anime on this page. Total: ${allAnime.length}`);
                
                // Small delay to be respectful
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (error) {
                console.error(`Error scraping ${endpoint}:`, error.message);
                // Continue with next endpoint
            }
        }

        console.log(`Comprehensive scrape completed! Total anime collected: ${allAnime.length}`);
        
        // Save to file
        const jsonContent = JSON.stringify(allAnime, null, 2);
        fs.writeFileSync(path.join(__dirname, 'comprehensive_anime.json'), jsonContent);
        console.log(`Saved ${allAnime.length} anime to comprehensive_anime.json`);
        
        res.json({
            message: 'Comprehensive scrape completed',
            total_anime: allAnime.length,
            anime: allAnime
        });
        
    } catch (error) {
        console.error('Error in comprehensive scrape:', error.message);
        res.status(500).json({ 
            error: 'Comprehensive scrape failed',
            message: error.message 
        });
    }
});

// MEGA SCRAPING ENDPOINT - Creates downloadable ZIP with hundreds of anime
app.get('/anime/mega-scrape', async (req, res) => {
    try {
        console.log('Starting MEGA scrape of 9animetv.to...');
        const allAnime = [];
        const scrapedUrls = new Set();
        
        // Even more endpoints including genre pages
        const endpoints = [
            'https://9animetv.to/recently-updated',
            'https://9animetv.to/recently-updated?page=2',
            'https://9animetv.to/recently-updated?page=3',
            'https://9animetv.to/recently-updated?page=4',
            'https://9animetv.to/recently-updated?page=5',
            'https://9animetv.to/recently-updated?page=6',
            'https://9animetv.to/popular',
            'https://9animetv.to/popular?page=2',
            'https://9animetv.to/popular?page=3',
            'https://9animetv.to/popular?page=4',
            'https://9animetv.to/trending',
            'https://9animetv.to/trending?page=2',
            'https://9animetv.to/trending?page=3',
            'https://9animetv.to/latest',
            'https://9animetv.to/latest?page=2',
            'https://9animetv.to/latest?page=3',
            'https://9animetv.to/genre/action',
            'https://9animetv.to/genre/action?page=2',
            'https://9animetv.to/genre/adventure',
            'https://9animetv.to/genre/comedy',
            'https://9animetv.to/genre/drama',
            'https://9animetv.to/genre/fantasy',
            'https://9animetv.to/genre/romance',
            'https://9animetv.to/genre/supernatural'
        ];

        for (const endpoint of endpoints) {
            try {
                console.log(`MEGA Scraping: ${endpoint}`);
                
                const response = await axios.get(endpoint, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    },
                    timeout: 20000
                });

                const $ = cheerio.load(response.data);
                let pageCount = 0;

                $('.flw-item').each((index, element) => {
                    const $element = $(element);
                    
                    const titleElement = $element.find('.film-name a');
                    const title = titleElement.attr('title') || titleElement.text().trim();
                    
                    const relativeUrl = titleElement.attr('href');
                    const url = relativeUrl ? `https://9animetv.to${relativeUrl}` : '';
                    
                    if (scrapedUrls.has(url)) {
                        return;
                    }
                    
                    const imgElement = $element.find('.film-poster img');
                    const img_url = imgElement.attr('data-src') || imgElement.attr('src') || '';
                    
                    const episodeInfo = $element.find('.fdi-item').text().trim();
                    const currentYear = new Date().getFullYear();
                    const title_with_year = `${title} (${currentYear})`;
                    
                    const genres = 'Action, Adventure, Anime';
                    const plot = `Watch ${title} online for free. ${episodeInfo} Latest episodes available on 9anime.`;

                    if (title && url) {
                        allAnime.push({
                            url: url,
                            title_with_year: title_with_year,
                            genres: genres,
                            img_url: img_url,
                            plot: plot
                        });
                        scrapedUrls.add(url);
                        pageCount++;
                    }
                });
                
                console.log(`MEGA: Found ${pageCount} anime on this page. Total: ${allAnime.length}`);
                
                // Delay between requests
                await new Promise(resolve => setTimeout(resolve, 1500));
                
            } catch (error) {
                console.error(`MEGA Error scraping ${endpoint}:`, error.message);
            }
        }

        console.log(`MEGA scrape completed! Total anime collected: ${allAnime.length}`);
        
        // Save to multiple files
        const jsonContent = JSON.stringify(allAnime, null, 2);
        fs.writeFileSync(path.join(__dirname, 'mega_anime_collection.json'), jsonContent);
        
        // Create ZIP file for download
        const archiver = require('archiver');
        const archive = archiver('zip', { zlib: { level: 9 } });
        
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', 'attachment; filename="mega_anime_collection.zip"');
        
        archive.pipe(res);
        archive.append(jsonContent, { name: 'series.json' });
        archive.finalize();
        
        console.log(`MEGA anime ZIP served with ${allAnime.length} titles`);
        
    } catch (error) {
        console.error('Error in MEGA scrape:', error.message);
        res.status(500).json({ 
            error: 'MEGA scrape failed',
            message: error.message 
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'Anime scraper is running' });
});

// Test endpoint with sample data
app.get('/test', (req, res) => {
    const sampleData = [
        {
            url: "https://9animetv.to/watch/one-piece-100",
            title_with_year: "One Piece",
            genres: "Action, Adventure, Comedy",
            img_url: "https://cdn.noitatnemucod.net/thumbnail/300x400/100/bcd84731a3eda4f4a306250769675065.jpg",
            plot: "Watch One Piece online for free on 9anime"
        },
        {
            url: "https://9animetv.to/watch/naruto-shippuden-355",
            title_with_year: "Naruto: Shippuden",
            genres: "Action, Martial Arts, Ninja",
            img_url: "https://cdn.noitatnemucod.net/thumbnail/300x400/100/9cbcf87f54194742e7686119089478f8.jpg",
            plot: "Watch Naruto: Shippuden online for free on 9anime"
        }
    ];
    res.json(sampleData);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Anime scraper server running on port ${PORT}`);
    console.log(`Endpoint: http://localhost:${PORT}/anime/recently-updated`);
});