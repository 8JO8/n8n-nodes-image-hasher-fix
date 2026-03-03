const gulp = require('gulp');

gulp.task('build:icons', () => {
  return gulp
    .src('nodes/**/*.{svg,png}')
    .pipe(gulp.dest('dist/nodes'));
});