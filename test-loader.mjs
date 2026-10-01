export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !specifier.match(/\.(js|jsx|mjs|cjs|json)$/)) {
    for (const ext of ['.js', '.jsx']) {
      try {
        return await nextResolve(specifier + ext, context);
      } catch {}
    }
  }
  return nextResolve(specifier, context);
}
