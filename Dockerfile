# Use Node.js 20 as the base image
FROM node:20-slim

# Set the working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the application code
COPY . .

# Build the frontend
RUN npm run build

# Expose the port the app runs on
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV GOOGLE_APPLICATION_CREDENTIALS=/app/terraform-service-account.json

# Start the server
CMD ["npm", "run", "dev"]
