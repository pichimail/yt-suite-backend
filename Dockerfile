# Use Node.js 18 for better compatibility
FROM node:18-slim

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Install system dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-pip \
    curl \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp using pip (most reliable method)
RUN pip3 install --no-cache-dir yt-dlp

# Verify installations work
RUN ffmpeg -version
RUN yt-dlp --version

# Create app directory
WORKDIR /app

# Copy package files first (for better Docker caching)
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY . .

# Create temp directory for downloads
RUN mkdir -p temp_downloads

# Expose port (Cloud Run will inject PORT env var)
EXPOSE 8080

# Add health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Start the application
CMD ["npm", "start"]
