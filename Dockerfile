# ---- Build Stage ----
FROM node:18.18.2-alpine as build

# Set working directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install all dependencies, not only production ones
RUN npm install

# Copy the source code
COPY src src
COPY tsconfig.json tsconfig.json
COPY types.d.ts types.d.ts

# Build the application
RUN npm run build

# ---- Run Stage ----
FROM node:18.18.2-alpine as runner

WORKDIR /usr/src/app

# Install production dependencies 
# Using --only=production here gives us minimal dependencies at runtime
COPY package*.json ./
RUN npm ci --only=production

# Copy built app from previous stage
COPY --from=build /usr/src/app/dist ./dist

# Your app binds to port 8080 so you'll use the EXPOSE instruction 
# to have it mapped by the docker daemon
EXPOSE 8080

# Run the application
CMD [ "node", "dist/main" ]