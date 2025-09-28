# Use Node.js 18 for better compatibility
FROM node:18

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Install system dependencies (ffmpeg, python, curl)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-pip \
    curl \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp using pip (more reliable than wget)
RUN pip3 install yt-dlp

# Verify installations
RUN ffmpeg -version && yt-dlp --version

# Create app directory
WORKDIR /app

# Copy package files first (for better caching)
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY . .

# Create temp directory for downloads
RUN mkdir -p temp_downloads

# Expose port (Cloud Run uses PORT env variable)
EXPOSE $PORT

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:$PORT/health || exit 1

# Start the application
CMD ["npm", "start"]
